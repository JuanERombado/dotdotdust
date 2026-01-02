# launch-sim.ps1
# This script runs the Chopsticks simulation in an isolated environment to bypass dependency hell.

$env:NODE_PATH = "" 
npx -y --package @acala-network/chopsticks@latest chopsticks --version
