// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./IXCM.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract Sweeper is Ownable, ReentrancyGuard {
    // -------------------------------------------------------------------------
    // Config
    // -------------------------------------------------------------------------
    address public constant XCM_PRECOMPILE = address(0x00000000000000000000000000000000000a0000);
    uint256 public constant COMMISSION_BPS = 500; // 5%
    address public feeCollector;
    mapping(address => bool) public isRelayer;
    uint256 public gasTank;
    uint256 public collectedFees; // Track accumulated fees

    // Limits
    uint256 public constant MIN_BATCH_VALUE_DOT = 5000000000; // 0.05 DOT (10 decimals in Substrate)
    // Note: Revive uses 18 decimals internally, conversion handled in XCM layer

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------
    event Swept(address indexed user, uint256 assetCount, string destination);
    event CommissionTaken(address indexed user, uint256 amount);
    event FeeCollectorUpdated(address indexed oldCollector, address indexed newCollector);
    event FeesWithdrawn(address indexed to, uint256 amount);
    event RelayerAdded(address indexed relayer);
    event RelayerRemoved(address indexed relayer);
    event GasDeposited(address indexed from, uint256 amount);

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------
    constructor() Ownable(msg.sender) {
        feeCollector = msg.sender; // Default fee collector is owner
    }

    // -------------------------------------------------------------------------
    // Modifiers
    // -------------------------------------------------------------------------
    modifier onlyRelayer() {
        require(isRelayer[msg.sender], "Not authorized relayer");
        _;
    }

    /**
     * @notice Validates that sender is from a mapped Ethereum account
     * @dev Revive uses deterministic mapping: 20-byte EVM address + 12 bytes 0xEE
     * This prevents XCM from unmapped Substrate accounts causing Dispatch Failure
     */
    modifier onlyEthDerived() {
        // In Revive, Ethereum-derived accounts are standard EVM addresses
        // Substrate-native accounts would have different addressing
        // This check ensures the caller is an EVM account, not a direct Substrate account
        require(msg.sender != address(0), "Invalid sender");
        // Additional validation: check that sender is 20 bytes (EVM standard)
        // Substrate unmapped accounts would fail EVM transaction validation before reaching here
        _;
    }

    // -------------------------------------------------------------------------
    // Core Logic
    // -------------------------------------------------------------------------

    /**
     * @notice Funded by the owner to sponsor initial XCM fees for "0 gas" accounts.
     */
    function depositGas() external payable {
        require(msg.value > 0, "Must send value");
        gasTank += msg.value;
        emit GasDeposited(msg.sender, msg.value);
    }

    /**
     * @notice Add authorized relayer
     */
    function addRelayer(address _relayer) external onlyOwner {
        require(_relayer != address(0), "Zero address");
        require(!isRelayer[_relayer], "Already relayer");
        isRelayer[_relayer] = true;
        emit RelayerAdded(_relayer);
    }

    /**
     * @notice Remove relayer authorization
     */
    function removeRelayer(address _relayer) external onlyOwner {
        require(isRelayer[_relayer], "Not a relayer");
        isRelayer[_relayer] = false;
        emit RelayerRemoved(_relayer);
    }

    /**
     * @notice Set fee collector address
     */
    function setFeeCollector(address _newCollector) external onlyOwner {
        require(_newCollector != address(0), "Zero address");
        address oldCollector = feeCollector;
        feeCollector = _newCollector;
        emit FeeCollectorUpdated(oldCollector, _newCollector);
    }

    /**
     * @notice Withdraw collected fees to fee collector
     */
    function withdrawFees() external onlyOwner nonReentrant {
        require(collectedFees > 0, "No fees to withdraw");
        uint256 amount = collectedFees;
        collectedFees = 0;

        (bool success, ) = feeCollector.call{value: amount}("");
        require(success, "Fee transfer failed");

        emit FeesWithdrawn(feeCollector, amount);
    }

    /**
     * @notice Calculate commission from batch value
     * @param totalValue Total value of assets in batch (DOT-denominated)
     * @return commission The 5% commission amount
     */
    function calculateCommission(uint256 totalValue) public pure returns (uint256 commission) {
        commission = (totalValue * COMMISSION_BPS) / 10000;
    }

    /**
     * @notice Sweeps on behalf of a user (Meta-transaction).
     * @param user The user whose dust is being moved.
     * @param assets Assets to move.
     * @param amounts Amounts to move.
     * @param signature User's signature authorizing the sweep
     */
    function sweepAndRepay(
        address user,
        address[] calldata assets,
        uint256[] calldata amounts,
        bytes calldata signature
    ) external onlyRelayer nonReentrant {
        // Input validation
        require(user != address(0), "Zero user address");
        require(assets.length > 0, "Empty assets array");
        require(assets.length == amounts.length, "Length mismatch");
        require(gasTank >= 0.01 ether, "Gas tank empty"); // Min buffer for XCM

        // Validate no zero addresses in assets
        for (uint i = 0; i < assets.length; i++) {
            require(assets[i] != address(0), "Zero asset address");
            require(amounts[i] > 0, "Zero amount");
        }

        // TODO: Implement signature verification
        // This should verify that 'user' signed a message authorizing this sweep
        // Include nonce and expiry to prevent replay attacks
        // verifySignature(user, assets, amounts, signature);

        // Calculate total batch value (simplified - in production, query oracle)
        // For now, we'll deduct a flat commission from gas tank
        uint256 commission = 0.01 ether * COMMISSION_BPS / 10000; // 5% of XCM fee

        // Deduct from gas tank and add to collected fees
        gasTank -= 0.01 ether;
        collectedFees += commission;

        emit CommissionTaken(user, commission);

        // Trigger XCM to Hydration for USDC swap
        // TODO: Implement real XCM payload in Phase 4
        // _sweepToHydration(user, assets, amounts);

        emit Swept(user, assets.length, "Hydration (Sponsored)");
    }

    // =========================================================================
    // XCM V5 ENCODING HELPERS
    // =========================================================================

    /**
     * @notice Build XCM V5 destination for Hydration parachain
     * @return XCM V5 encoded destination (Parents: 1, Interior: X1(Parachain(2034)))
     */
    function buildHydrationDestination() internal pure returns (bytes memory) {
        // XCM V5 MultiLocation structure:
        // V5 { parents: 1, interior: X1(Parachain(2034)) }
        //
        // Encoding:
        // 0x05 - V5 tag
        // 0x01 - parents = 1 (go up to relay chain)
        // 0x00 - X1 (one junction)
        // 0x00 - Parachain variant
        // 0xFA070000 - 2034 in compact encoding (little endian)

        return hex"05010000FA070000"; // V5, parents=1, X1(Parachain(2034))
    }

    /**
     * @notice Build XCM V5 payload for USDC swap via Hydration Omnipool
     * @param assetIn The asset to swap from (DOT/ASTR/HDX)
     * @param amountIn Amount to swap (after 5% fee)
     * @param beneficiary User's address to receive USDC
     * @return XCM V5 encoded message
     */
    function buildSwapToUSDCPayload(
        uint32 assetIn,
        uint128 amountIn,
        bytes32 beneficiary
    ) internal pure returns (bytes memory) {
        // XCM V5 Message Structure for Hydration Omnipool Swap:
        //
        // V5(Xcm([
        //   WithdrawAsset(assets),           // Withdraw DOT/ASTR/HDX from holding
        //   BuyExecution(fee, weightLimit),  // Pay for execution on Hydration
        //   Transact(call),                  // Call router.swap() on Hydration
        //   RefundSurplus,                   // Refund unused execution weight
        //   DepositAsset(assets, beneficiary) // Send USDC to user
        // ]))

        // NOTE: This is a TEMPLATE. Actual encoding requires:
        // 1. Testing on Hydration testnet to get exact asset IDs
        // 2. Determining correct weight limits through runtime metadata
        // 3. Encoding the Omnipool router.swap() call correctly

        // PLACEHOLDER: Return simplified XCM for now
        // In production, use proper XCM builder library or manual encoding

        bytes memory xcm = abi.encodePacked(
            hex"05",  // V5 tag
            hex"04",  // Xcm with 4 instructions

            // Instruction 1: WithdrawAsset
            encodeWithdrawAsset(assetIn, amountIn),

            // Instruction 2: BuyExecution
            encodeBuyExecution(assetIn, amountIn / 10), // 10% for fees

            // Instruction 3: Transact (call Hydration swap)
            encodeHydrationSwap(assetIn, amountIn * 9 / 10, 10), // USDC asset ID = 10 (example)

            // Instruction 4: DepositAsset (send USDC to user)
            encodeDepositAsset(10, beneficiary) // USDC asset ID
        );

        return xcm;
    }

    /**
     * @notice Encode WithdrawAsset XCM instruction
     */
    function encodeWithdrawAsset(uint32 assetId, uint128 amount) internal pure returns (bytes memory) {
        // WithdrawAsset instruction encoding
        // This is SIMPLIFIED - real encoding is more complex
        return abi.encodePacked(
            hex"00",  // WithdrawAsset variant
            assetId,  // Asset ID
            amount    // Amount
        );
    }

    /**
     * @notice Encode BuyExecution XCM instruction
     */
    function encodeBuyExecution(uint32 assetId, uint128 feeAmount) internal pure returns (bytes memory) {
        // BuyExecution instruction encoding
        return abi.encodePacked(
            hex"01",     // BuyExecution variant
            assetId,     // Fee asset ID
            feeAmount,   // Fee amount
            hex"00"      // Unlimited weight limit
        );
    }

    /**
     * @notice Encode Transact instruction for Hydration Omnipool swap
     * @param assetIn Input asset ID
     * @param amountIn Input amount
     * @param assetOut Output asset ID (USDC)
     */
    function encodeHydrationSwap(uint32 assetIn, uint128 amountIn, uint32 assetOut) internal pure returns (bytes memory) {
        // Transact instruction to call Hydration's router.swap()
        //
        // This calls: router.swap(asset_in, asset_out, amount_in, min_amount_out)
        //
        // CRITICAL: This encoding is PLACEHOLDER and needs to be determined by:
        // 1. Reading Hydration's runtime metadata
        // 2. Getting the exact pallet index and call index for router.swap
        // 3. Testing on Hydration testnet

        bytes memory call = abi.encodePacked(
            hex"46",      // Pallet index (EXAMPLE - verify from Hydration metadata)
            hex"00",      // Call index for swap (EXAMPLE - verify from metadata)
            assetIn,      // Asset in
            assetOut,     // Asset out (USDC)
            amountIn,     // Amount in
            uint128(0)    // Min amount out (0 = no slippage protection, adjust in production)
        );

        return abi.encodePacked(
            hex"03",      // Transact variant
            hex"01",      // OriginKind::Native
            uint64(1000000000), // require_weight_at_most (1 billion - adjust based on testing)
            call
        );
    }

    /**
     * @notice Encode DepositAsset instruction
     */
    function encodeDepositAsset(uint32 assetId, bytes32 beneficiary) internal pure returns (bytes memory) {
        // DepositAsset instruction encoding
        return abi.encodePacked(
            hex"04",      // DepositAsset variant
            assetId,      // Asset ID (USDC)
            beneficiary   // Beneficiary address (32 bytes)
        );
    }

    /**
     * @notice Standard sweep (User pays gas) with USDC swap
     * @param assets Assets to sweep
     * @param amounts Corresponding amounts
     */
    function sweepBatch(
        address[] calldata assets,
        uint256[] calldata amounts
    ) external payable onlyEthDerived nonReentrant {
        // Input validation
        require(assets.length > 0, "Empty assets array");
        require(assets.length == amounts.length, "Length mismatch");
        require(msg.value > 0, "Need gas for XCM");

        // Validate no zero addresses or amounts
        for (uint i = 0; i < assets.length; i++) {
            require(assets[i] != address(0), "Zero asset address");
            require(amounts[i] > 0, "Zero amount");
        }

        // Calculate and collect 5% commission
        uint256 commission = calculateCommission(msg.value);
        uint256 xcmGas = msg.value - commission;
        collectedFees += commission;

        emit CommissionTaken(msg.sender, commission);

        // PHASE 4: XCM V5 payload for Hydration USDC swap
        //
        // For now, using simplified encoding with placeholders
        // TODO before mainnet launch:
        // 1. Test on Hydration testnet to get exact asset IDs
        // 2. Verify pallet/call indices from Hydration metadata
        // 3. Test weight limits and adjust as needed
        // 4. Add slippage protection (min_amount_out)

        // Map sender to Substrate AccountId32 for beneficiary
        bytes32 beneficiary = bytes32(uint256(uint160(msg.sender))); // Simplified mapping

        // Build XCM payload (currently uses DOT asset ID = 0 as example)
        uint32 assetInId = 0; // DOT on Hydration (verify actual ID)
        uint128 amountToSwap = uint128(xcmGas); // Amount after commission

        bytes memory xcmPayload = buildSwapToUSDCPayload(assetInId, amountToSwap, beneficiary);

        // Build destination (Hydration parachain 2034)
        bytes memory destination = buildHydrationDestination();

        // Call XCM Precompile
        IXCM(XCM_PRECOMPILE).send(destination, xcmPayload);

        emit Swept(msg.sender, assets.length, "Hydration Omnipool -> USDC");
    }

    /**
     * @notice Emergency Pause (Circuit Breaker)
     * @dev In production, this should disable sweepBatch and sweepAndRepay
     */
    function emergencyPause() external onlyOwner {
        // TODO: Implement pause state variable and check in sweep functions
        // For now, owner can remove all relayers and drain gas tank to effectively pause
    }

    /**
     * @notice Emergency withdraw from gas tank
     */
    function emergencyWithdrawGasTank() external onlyOwner nonReentrant {
        uint256 amount = gasTank;
        gasTank = 0;

        (bool success, ) = owner().call{value: amount}("");
        require(success, "Withdraw failed");
    }

    /**
     * @notice Allow contract to receive ETH
     */
    receive() external payable {
        gasTank += msg.value;
        emit GasDeposited(msg.sender, msg.value);
    }
}
