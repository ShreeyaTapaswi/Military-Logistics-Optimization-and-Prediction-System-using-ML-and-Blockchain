// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * ============================================================
 *  LAYER 2 -  AUDIT TRAIL  (Immutable Audit Log & ML Predictions)
 * ============================================================
 *
 * After data flows through MySQL and the ML pipeline, the results
 * are written back to this contract so that:
 *   1. Every action has a permanent, tamper-proof audit entry.
 *   2. ML predictions (alerts, anomalies, demand forecasts) are
 *      stored on-chain for verifiability.
 *
 * Flow:  MySQL  ──►  ML Engine  ──►  This contract  ──►  Dashboard
 *
 * The Django backend calls these functions via Web3.py after ML
 * processing is complete.
 */

contract AuditTrail {

    // ───────── Access Control ─────────
    address public superAdmin;
    mapping(address => bool) public authorisedBackends;   // Django backend wallets

    // ───────── Data Structures ─────────

    enum ActionCategory { VEHICLE_MOVEMENT, SPARE_PART_MOVEMENT, MAINTENANCE }
    enum AlertSeverity  { INFO, LOW, MEDIUM, HIGH, CRITICAL }

    struct AuditEntry {
        uint256         id;
        bytes32         baseId;
        ActionCategory  category;
        uint256         layer1RefId;    // ID from AssetLedger contract
        string          actionSummary;  // human-readable summary
        string          performedBy;    // username / wallet
        bytes32         dataHash;       // SHA-256 of the MySQL row for integrity check
        uint256         timestamp;
    }

    struct MLPrediction {
        uint256         id;
        bytes32         baseId;
        string          predictionType;   // e.g. "DEMAND_FORECAST", "ANOMALY", "MAINTENANCE_DUE"
        string          description;      // ML model output summary
        AlertSeverity   severity;
        string          affectedAsset;    // vehicle number or part code
        uint256         confidence;       // 0-10000 (basis points, i.e. 9500 = 95.00%)
        string          recommendedAction;
        uint256         timestamp;
    }

    // ───────── Storage ─────────

    uint256 public auditEntryCount;
    uint256 public mlPredictionCount;

    mapping(uint256 => AuditEntry)   public auditEntries;
    mapping(uint256 => MLPrediction) public mlPredictions;

    // base --> audit entry IDs
    mapping(bytes32 => uint256[]) private baseAuditTrail;
    // base --> ML prediction IDs
    mapping(bytes32 => uint256[]) private basePredictions;
    // asset hash --> audit entry IDs
    mapping(bytes32 => uint256[]) private assetAuditTrail;
    // asset hash --> ML prediction IDs
    mapping(bytes32 => uint256[]) private assetPredictions;

    // ───────── Events ─────────

    event AuditEntryLogged(
        uint256 indexed id,
        bytes32 indexed baseId,
        ActionCategory  category,
        uint256         layer1RefId,
        bytes32         dataHash,
        uint256         timestamp
    );

    event MLPredictionStored(
        uint256 indexed id,
        bytes32 indexed baseId,
        string          predictionType,
        AlertSeverity   severity,
        string          affectedAsset,
        uint256         confidence,
        uint256         timestamp
    );

    event BackendAuthorised(address backend);
    event BackendRevoked(address backend);

    // ───────── Modifiers ─────────

    modifier onlySuperAdmin() {
        require(msg.sender == superAdmin, "Only Super Admin");
        _;
    }

    modifier onlyAuthorised() {
        require(
            msg.sender == superAdmin || authorisedBackends[msg.sender],
            "Not authorised"
        );
        _;
    }

    // ───────── Constructor ─────────

    constructor() {
        superAdmin = msg.sender;
    }

    // ═══════════ AUTHORISATION ═══════════

    /**
     * @notice Authorise a backend wallet (the Django server's account) to write entries.
     */
    function authoriseBackend(address _backend) external onlySuperAdmin {
        authorisedBackends[_backend] = true;
        emit BackendAuthorised(_backend);
    }

    /**
     * @notice Revoke a backend wallet.
     */
    function revokeBackend(address _backend) external onlySuperAdmin {
        authorisedBackends[_backend] = false;
        emit BackendRevoked(_backend);
    }

    // ═══════════ LAYER 2- AUDIT LOG ═══════════

    /**
     * @notice Write an immutable audit entry after MySQL persistence.
     * @param _baseId         Human-readable base ID (hashed on-chain).
     * @param _category       Which asset category this action belongs to.
     * @param _layer1RefId    Corresponding entry ID from the AssetLedger contract.
     * @param _actionSummary  Readable summary, e.g. "Removed 2 vehicles – deployed to border".
     * @param _performedBy    Username or wallet string of the actor.
     * @param _dataHash       SHA-256 hash of the full MySQL record for integrity verification.
     * @param _affectedAsset  Vehicle number or part code (for indexing).
     */
    function logAuditEntry(
        string calldata   _baseId,
        ActionCategory    _category,
        uint256           _layer1RefId,
        string calldata   _actionSummary,
        string calldata   _performedBy,
        bytes32           _dataHash,
        string calldata   _affectedAsset
    )
        external onlyAuthorised
        returns (uint256 entryId)
    {
        auditEntryCount++;
        entryId = auditEntryCount;

        bytes32 baseHash = keccak256(abi.encodePacked(_baseId));

        auditEntries[entryId] = AuditEntry({
            id:            entryId,
            baseId:        baseHash,
            category:      _category,
            layer1RefId:   _layer1RefId,
            actionSummary: _actionSummary,
            performedBy:   _performedBy,
            dataHash:      _dataHash,
            timestamp:     block.timestamp
        });

        baseAuditTrail[baseHash].push(entryId);
        assetAuditTrail[keccak256(abi.encodePacked(_affectedAsset))].push(entryId);

        emit AuditEntryLogged(
            entryId, baseHash, _category,
            _layer1RefId, _dataHash, block.timestamp
        );

        return entryId;
    }

    // ═══════════ LAYER 2- ML PREDICTIONS ═══════════

    /**
     * @notice Store an ML prediction on-chain for verifiability.
     * @param _baseId            Base this prediction concerns.
     * @param _predictionType    E.g. "DEMAND_FORECAST", "ANOMALY_DETECTION", "MAINTENANCE_ALERT".
     * @param _description       Human-readable model output.
     * @param _severity          Alert severity level.
     * @param _affectedAsset     Vehicle number or part code affected.
     * @param _confidence        Confidence in basis points (0–10000).
     * @param _recommendedAction Suggested action for the base admin.
     */
    function storeMLPrediction(
        string calldata   _baseId,
        string calldata   _predictionType,
        string calldata   _description,
        AlertSeverity     _severity,
        string calldata   _affectedAsset,
        uint256           _confidence,
        string calldata   _recommendedAction
    )
        external onlyAuthorised
        returns (uint256 predictionId)
    {
        require(_confidence <= 10000, "Confidence must be 0-10000 basis points");

        mlPredictionCount++;
        predictionId = mlPredictionCount;

        bytes32 baseHash = keccak256(abi.encodePacked(_baseId));

        mlPredictions[predictionId] = MLPrediction({
            id:                predictionId,
            baseId:            baseHash,
            predictionType:    _predictionType,
            description:       _description,
            severity:          _severity,
            affectedAsset:     _affectedAsset,
            confidence:        _confidence,
            recommendedAction: _recommendedAction,
            timestamp:         block.timestamp
        });

        basePredictions[baseHash].push(predictionId);
        assetPredictions[keccak256(abi.encodePacked(_affectedAsset))].push(predictionId);

        emit MLPredictionStored(
            predictionId, baseHash, _predictionType,
            _severity, _affectedAsset, _confidence,
            block.timestamp
        );

        return predictionId;
    }

    // ═══════════ READ FUNCTIONS ═══════════

    /**
     * @notice Get all audit entry IDs for a base.
     */
    function getBaseAuditTrail(string calldata _baseId)
        external view
        returns (uint256[] memory)
    {
        return baseAuditTrail[keccak256(abi.encodePacked(_baseId))];
    }

    /**
     * @notice Get all ML prediction IDs for a base.
     */
    function getBasePredictions(string calldata _baseId)
        external view
        returns (uint256[] memory)
    {
        return basePredictions[keccak256(abi.encodePacked(_baseId))];
    }

    /**
     * @notice Get all audit entry IDs for a specific asset (vehicle / part).
     */
    function getAssetAuditTrail(string calldata _asset)
        external view
        returns (uint256[] memory)
    {
        return assetAuditTrail[keccak256(abi.encodePacked(_asset))];
    }

    /**
     * @notice Get all ML prediction IDs for a specific asset.
     */
    function getAssetPredictions(string calldata _asset)
        external view
        returns (uint256[] memory)
    {
        return assetPredictions[keccak256(abi.encodePacked(_asset))];
    }

    /**
     * @notice Full details of an audit entry.
     */
    function getAuditEntryDetails(uint256 _id)
        external view
        returns (
            bytes32        baseId,
            ActionCategory category,
            uint256        layer1RefId,
            string memory  actionSummary,
            string memory  performedBy,
            bytes32        dataHash,
            uint256        timestamp
        )
    {
        AuditEntry storage e = auditEntries[_id];
        return (
            e.baseId, e.category, e.layer1RefId,
            e.actionSummary, e.performedBy,
            e.dataHash, e.timestamp
        );
    }

    /**
     * @notice Full details of an ML prediction.
     */
    function getMLPredictionDetails(uint256 _id)
        external view
        returns (
            bytes32        baseId,
            string memory  predictionType,
            string memory  description,
            AlertSeverity  severity,
            string memory  affectedAsset,
            uint256        confidence,
            string memory  recommendedAction,
            uint256        timestamp
        )
    {
        MLPrediction storage p = mlPredictions[_id];
        return (
            p.baseId, p.predictionType, p.description,
            p.severity, p.affectedAsset, p.confidence,
            p.recommendedAction, p.timestamp
        );
    }

    /**
     * @notice Verify data integrity- compare stored hash with a provided hash.
     */
    function verifyDataIntegrity(uint256 _auditEntryId, bytes32 _expectedHash)
        external view
        returns (bool)
    {
        return auditEntries[_auditEntryId].dataHash == _expectedHash;
    }

    // ═══════════ UTILITY ═══════════

    function getTotalRecords() external view returns (uint256 audits, uint256 predictions) {
        return (auditEntryCount, mlPredictionCount);
    }
}
