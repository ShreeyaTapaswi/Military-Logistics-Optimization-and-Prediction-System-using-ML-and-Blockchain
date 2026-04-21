// 2_deploy_asset_ledger.js
// Deploys the Layer 1 contract- Entry Validation & Recording
const AssetLedger = artifacts.require("AssetLedger");

module.exports = function (deployer) {
  deployer.deploy(AssetLedger);
};
