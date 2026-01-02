const { u8aToHex } = require("@polkadot/util");
const { decodeAddress } = require("@polkadot/util-crypto");

const addr1 = "5GqFku7dP6C8iHtW8zC5yC4zC5yC4zC5yC4zC5yC4zC5yC4z"; // Fake example, from screenshot I can't copy exact text
// Actually, I can't read the full address from screenshot.
// But I can decode the one I used.

const myAddr = "15mYuEYUYN2vMuuQndfxDvnKGVBhN57J3aLmQJTRdFEqxU9P";
console.log(`My Addr Hex: ${u8aToHex(decodeAddress(myAddr))}`);

// Query via console log in node
