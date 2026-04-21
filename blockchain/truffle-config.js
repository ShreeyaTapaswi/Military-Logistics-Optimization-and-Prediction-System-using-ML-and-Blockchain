/**
 * Truffle Configuration- Military Base Asset Tracking System
 * Connects to Ganache local private Ethereum network.
 *
 * Default Ganache settings:
 *   Host: 127.0.0.1
 *   Port: 7545
 *   Network ID: 5777
 *
 * Make sure Ganache is running before you compile/migrate.
 */

module.exports = {
  networks: {
    development: {
      host: "127.0.0.1",
      port: 7545,           // Ganache default GUI port  (CLI uses 8545)
      network_id: "*",      // Match any network id
      gas: 6721975,         // Gas limit
      gasPrice: 20000000000 // 20 gwei
    }
  },

  // Solidity compiler settings
  compilers: {
    solc: {
      version: "0.8.19",
      settings: {
        optimizer: {
          enabled: true,
          runs: 200
        }
      }
    }
  }
};
