/**
 * Tests for AssetLedger (Layer 1) and AuditTrail (Layer 2) contracts.
 *
 * Run:  cd blockchain && npx truffle test --network development
 * (Ganache must be running)
 */

const AssetLedger = artifacts.require("AssetLedger");
const AuditTrail  = artifacts.require("AuditTrail");

contract("AssetLedger (Layer 1)", (accounts) => {
  const superAdmin   = accounts[0];
  const baseAdmin1   = accounts[2];  // will be registered for JODHPUR_AFB
  const baseAdmin2   = accounts[3];  // will be registered for MUMBAI_NB
  const unauthorised = accounts[9];

  let ledger;

  before(async () => {
    ledger = await AssetLedger.deployed();
    // Register two base admins for two different bases
    await ledger.registerBaseAdmin("JODHPUR_AFB", baseAdmin1, { from: superAdmin });
    await ledger.registerBaseAdmin("MUMBAI_NB",   baseAdmin2, { from: superAdmin });
  });

  // ── Admin Management ──────────────────────────────

  it("should set deployer as super admin", async () => {
    const admin = await ledger.superAdmin();
    assert.equal(admin, superAdmin, "Super admin mismatch");
  });

  it("should register base admins correctly", async () => {
    const isAuth1 = await ledger.isAuthorisedAdmin(baseAdmin1);
    const isAuth2 = await ledger.isAuthorisedAdmin(baseAdmin2);
    assert.equal(isAuth1, true, "baseAdmin1 should be authorised");
    assert.equal(isAuth2, true, "baseAdmin2 should be authorised");
  });

  it("should reject non-super-admin from registering", async () => {
    try {
      await ledger.registerBaseAdmin("TEST_BASE", unauthorised, { from: unauthorised });
      assert.fail("Should have thrown");
    } catch (err) {
      assert(err.message.includes("Only Super Admin"), "Wrong error");
    }
  });

  // ── ACCESS CONTROL: Base Admin writes to OWN base ─────

  it("Base Admin 1 CAN write to their own base (JODHPUR_AFB)", async () => {
    const tx = await ledger.addVehicleMovement(
      "JODHPUR_AFB",         // base_id — matches admin1's registered base
      "MH-12-AB-1234",
      1,                     // REMOVAL
      -2,
      "Deployed to northern border",
      { from: baseAdmin1 }
    );

    const event = tx.logs.find(l => l.event === "VehicleMovementRecorded");
    assert.equal(event.args.vehicleNumber, "MH-12-AB-1234");
    assert.equal(event.args.quantityChange.toNumber(), -2);
  });

  it("Base Admin 1 CANNOT write to another base (MUMBAI_NB)", async () => {
    try {
      await ledger.addVehicleMovement(
        "MUMBAI_NB",           // WRONG base — admin1 is registered for JODHPUR
        "MH-99-ZZ-0000",
        0,
        1,
        "Should fail",
        { from: baseAdmin1 }
      );
      assert.fail("Should have thrown — writing to wrong base");
    } catch (err) {
      assert(
        err.message.includes("Base Admin can only write to own base"),
        `Wrong error: ${err.message}`
      );
    }
  });

  it("Base Admin 2 CAN write to their own base (MUMBAI_NB)", async () => {
    const tx = await ledger.addVehicleMovement(
      "MUMBAI_NB",
      "MH-01-CD-5678",
      0,   // ADDITION
      3,
      "New vehicles received from depot",
      { from: baseAdmin2 }
    );

    const event = tx.logs.find(l => l.event === "VehicleMovementRecorded");
    assert.equal(event.args.vehicleNumber, "MH-01-CD-5678");
    assert.equal(event.args.quantityChange.toNumber(), 3);
  });

  // ── ACCESS CONTROL: Super Admin writes to ANY base ────

  it("Super Admin CAN write to JODHPUR_AFB", async () => {
    const tx = await ledger.addVehicleMovement(
      "JODHPUR_AFB",
      "MH-12-AB-1234",
      0,   // ADDITION
      5,
      "Fleet replenishment ordered by HQ",
      { from: superAdmin }
    );

    const event = tx.logs.find(l => l.event === "VehicleMovementRecorded");
    assert.equal(event.args.quantityChange.toNumber(), 5);
  });

  it("Super Admin CAN write to MUMBAI_NB", async () => {
    const tx = await ledger.addVehicleMovement(
      "MUMBAI_NB",
      "MH-01-CD-9999",
      0,
      2,
      "Emergency allocation from HQ",
      { from: superAdmin }
    );

    const event = tx.logs.find(l => l.event === "VehicleMovementRecorded");
    assert.equal(event.args.vehicleNumber, "MH-01-CD-9999");
  });

  // ── ACCESS CONTROL: Unauthorised user rejected ────────

  it("Unauthorised user CANNOT write to any base", async () => {
    try {
      await ledger.addVehicleMovement(
        "JODHPUR_AFB", "XX-00-ZZ-0000", 0, 1, "test",
        { from: unauthorised }
      );
      assert.fail("Should have thrown");
    } catch (err) {
      assert(
        err.message.includes("Not authorised"),
        "Wrong error"
      );
    }
  });

  // ── Vehicle History ───────────────────────────────

  it("should return correct vehicle movement history", async () => {
    const history = await ledger.getVehicleHistory("MH-12-AB-1234");
    assert.equal(history.length, 2, "Should have 2 movements (1 by admin + 1 by super admin)");
  });

  // ── Spare Part Movements ──────────────────────────

  it("Base Admin can record spare part movement for own base", async () => {
    const tx = await ledger.addSparePartMovement(
      "JODHPUR_AFB",
      "ENG-OIL-FILTER-001",
      "Engine Oil Filter",
      1,    // REMOVAL
      -10,
      "Used during scheduled maintenance",
      { from: baseAdmin1 }
    );

    const event = tx.logs.find(l => l.event === "SparePartMovementRecorded");
    assert.equal(event.args.partCode, "ENG-OIL-FILTER-001");
  });

  it("Base Admin CANNOT record spare part for wrong base", async () => {
    try {
      await ledger.addSparePartMovement(
        "MUMBAI_NB",
        "BRK-PAD-001",
        "Brake Pad",
        0, 5, "test",
        { from: baseAdmin1 }   // admin1 is for JODHPUR, not MUMBAI
      );
      assert.fail("Should have thrown");
    } catch (err) {
      assert(err.message.includes("Base Admin can only write to own base"));
    }
  });

  // ── Maintenance Records ───────────────────────────

  it("Base Admin can record maintenance for own base", async () => {
    const tx = await ledger.addMaintenanceRecord(
      "JODHPUR_AFB",
      "MH-12-AB-1234",
      "Full engine service – oil change, filter replacement",
      ["ENG-OIL-FILTER-001", "ENG-OIL-5W30"],
      1250000,
      { from: baseAdmin1 }
    );

    const event = tx.logs.find(l => l.event === "MaintenanceRecordAdded");
    assert.equal(event.args.vehicleNumber, "MH-12-AB-1234");
  });

  it("Super Admin can record maintenance for any base", async () => {
    const tx = await ledger.addMaintenanceRecord(
      "MUMBAI_NB",
      "MH-01-CD-5678",
      "Emergency tyre replacement",
      ["TYR-MICH-225"],
      450000,
      { from: superAdmin }
    );

    const event = tx.logs.find(l => l.event === "MaintenanceRecordAdded");
    assert.equal(event.args.vehicleNumber, "MH-01-CD-5678");
  });

  // ── Statistics ────────────────────────────────────

  it("should report correct total entries", async () => {
    const total = await ledger.getTotalEntries();
    // 4 vehicle + 1 spare part + 2 maintenance = 7
    assert.equal(total.toNumber(), 7);
  });

  // ── Admin Revocation ──────────────────────────────

  it("should revoke a base admin and block their writes", async () => {
    await ledger.revokeBaseAdmin(baseAdmin2, { from: superAdmin });

    try {
      await ledger.addVehicleMovement(
        "MUMBAI_NB", "MH-01-XX-0000", 0, 1, "Should fail",
        { from: baseAdmin2 }
      );
      assert.fail("Should have thrown — admin was revoked");
    } catch (err) {
      assert(err.message.includes("Not authorised"));
    }
  });
});


contract("AuditTrail (Layer 2)", (accounts) => {
  const superAdmin    = accounts[0];
  const backendWallet = accounts[1];
  const unauthorised  = accounts[9];

  let trail;

  before(async () => {
    trail = await AuditTrail.deployed();
    // Authorise the backend wallet
    await trail.authoriseBackend(backendWallet, { from: superAdmin });
  });

  // ── Authorisation ─────────────────────────────────

  it("should authorise backend wallet", async () => {
    const isAuth = await trail.authorisedBackends(backendWallet);
    assert.equal(isAuth, true);
  });

  it("should reject unauthorised writes", async () => {
    try {
      await trail.logAuditEntry(
        "TEST_BASE", 0, 1, "test", "user",
        "0x0000000000000000000000000000000000000000000000000000000000000000",
        "ASSET-1",
        { from: unauthorised }
      );
      assert.fail("Should have thrown");
    } catch (err) {
      assert(err.message.includes("Not authorised"), "Wrong error");
    }
  });

  // ── Audit Entries ─────────────────────────────────

  it("should log an audit entry", async () => {
    const dataHash = web3.utils.sha3("test-mysql-row-data");

    const tx = await trail.logAuditEntry(
      "JODHPUR_AFB",
      0,  // VEHICLE_MOVEMENT
      1,  // Layer 1 ref ID
      "Removed 2 vehicles – deployed to northern border",
      "base_admin_jodhpur",
      dataHash,
      "MH-12-AB-1234",
      { from: backendWallet }
    );

    const event = tx.logs.find(l => l.event === "AuditEntryLogged");
    assert.equal(event.args.id.toNumber(), 1);
    assert.equal(event.args.dataHash, dataHash);
  });

  it("should retrieve base audit trail", async () => {
    const trail_ids = await trail.getBaseAuditTrail("JODHPUR_AFB");
    assert.equal(trail_ids.length, 1);
  });

  it("should retrieve asset audit trail", async () => {
    const trail_ids = await trail.getAssetAuditTrail("MH-12-AB-1234");
    assert.equal(trail_ids.length, 1);
  });

  // ── ML Predictions ────────────────────────────────

  it("should store an ML prediction", async () => {
    const tx = await trail.storeMLPrediction(
      "JODHPUR_AFB",
      "MAINTENANCE_ALERT",
      "Vehicle MH-12-AB-1234 engine service due in 15 days based on usage pattern",
      3,     // HIGH severity
      "MH-12-AB-1234",
      9200,  // 92.00% confidence
      "Schedule engine service within 2 weeks",
      { from: backendWallet }
    );

    const event = tx.logs.find(l => l.event === "MLPredictionStored");
    assert.equal(event.args.predictionType, "MAINTENANCE_ALERT");
    assert.equal(event.args.confidence.toNumber(), 9200);
  });

  it("should reject confidence > 10000", async () => {
    try {
      await trail.storeMLPrediction(
        "JODHPUR_AFB", "TEST", "test", 0, "asset", 10001, "action",
        { from: backendWallet }
      );
      assert.fail("Should have thrown");
    } catch (err) {
      assert(err.message.includes("Confidence must be 0-10000"), "Wrong error");
    }
  });

  it("should retrieve base predictions", async () => {
    const preds = await trail.getBasePredictions("JODHPUR_AFB");
    assert.equal(preds.length, 1);
  });

  // ── Data Integrity ────────────────────────────────

  it("should verify data integrity (matching hash)", async () => {
    const dataHash = web3.utils.sha3("test-mysql-row-data");
    const isValid = await trail.verifyDataIntegrity(1, dataHash);
    assert.equal(isValid, true, "Hashes should match");
  });

  it("should detect tampered data (mismatching hash)", async () => {
    const wrongHash = web3.utils.sha3("tampered-data");
    const isValid = await trail.verifyDataIntegrity(1, wrongHash);
    assert.equal(isValid, false, "Tampered data should fail verification");
  });

  // ── Statistics ────────────────────────────────────

  it("should report correct totals", async () => {
    const result = await trail.getTotalRecords();
    assert.equal(result[0].toNumber(), 1, "1 audit entry");
    assert.equal(result[1].toNumber(), 1, "1 ML prediction");
  });
});
