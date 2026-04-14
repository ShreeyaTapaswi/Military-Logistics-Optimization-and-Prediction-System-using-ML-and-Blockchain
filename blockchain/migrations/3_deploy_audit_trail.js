// 3_deploy_audit_trail.js
// Deploys the Layer 2 contract — Immutable Audit Log & ML Predictions
const AuditTrail = artifacts.require("AuditTrail");

module.exports = function (deployer) {
  deployer.deploy(AuditTrail);
};
