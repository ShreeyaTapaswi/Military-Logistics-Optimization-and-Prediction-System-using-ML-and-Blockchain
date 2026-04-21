// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * ============================================================
 *  LAYER 1 -  ASSET LEDGER  (Entry Validation & Recording)
 * ============================================================
 *
 * Every action a Base Admin or Super Admin performs (vehicle movement,
 * spare-part movement, maintenance record) is written here FIRST.
 *
 * Flow:  Admin action  ──►  This contract  ──►  MySQL storage
 *
 * ACCESS CONTROL (enforced ON-CHAIN):
 *   • Base Admin  → can ONLY write to their own registered base.
 *   • Super Admin → can write to ANY base (must provide base ID).
 *   • Anyone else → rejected.
 *
 * The contract validates the caller, records a tamper-proof on-chain
 * entry, and emits an event that the Django backend listens for as
 * confirmation before persisting to MySQL.
 *
 * Designed for a Ganache private network- gas costs are irrelevant.
 */

contract AssetLedger {

    // ───────── Access Control ─────────
    address public superAdmin;

    // baseId (string hash) --> admin wallet address
    mapping(bytes32 => address) public baseAdmins;
    // wallet --> authorised?
    mapping(address => bool)    public isAuthorisedAdmin;
    // wallet --> baseId hash
    mapping(address => bytes32) public adminToBase;

    // ───────── Data Structures ─────────

    enum MovementType { ADDITION, REMOVAL, TRANSFER }
    enum RecordStatus { PENDING, VALIDATED, REJECTED }

    struct VehicleMovement {
        uint256   id;
        bytes32   baseId;           // keccak256 of base name / code
        string    vehicleNumber;
        MovementType movementType;
        int256    quantityChange;   // +ve for additions, -ve for removals
        string    reason;
        address   recordedBy;
        uint256   timestamp;
        RecordStatus status;
    }

    struct SparePartMovement {
        uint256   id;
        bytes32   baseId;
        string    partCode;
        string    partName;
        MovementType movementType;
        int256    quantityChange;
        string    reason;
        address   recordedBy;
        uint256   timestamp;
        RecordStatus status;
    }

    struct MaintenanceRecord {
        uint256   id;
        bytes32   baseId;
        string    vehicleNumber;
        string    description;
        string[]  partsUsed;       // part codes consumed
        uint256   costEstimate;    // in smallest unit (paise)
        address   recordedBy;
        uint256   timestamp;
        RecordStatus status;
    }

    // ───────── Storage ─────────

    uint256 public vehicleMovementCount;
    uint256 public sparePartMovementCount;
    uint256 public maintenanceRecordCount;

    mapping(uint256 => VehicleMovement)   public vehicleMovements;
    mapping(uint256 => SparePartMovement) public sparePartMovements;
    mapping(uint256 => MaintenanceRecord) public maintenanceRecords;

    // vehicleNumber hash --> array of movement IDs  (quick lookup)
    mapping(bytes32 => uint256[]) private vehicleHistory;
    // vehicleNumber hash --> array of maintenance IDs
    mapping(bytes32 => uint256[]) private vehicleMaintenanceHistory;
    // partCode hash --> array of spare-part movement IDs
    mapping(bytes32 => uint256[]) private sparePartHistory;
    // baseId hash --> array of all entry IDs (for per-base queries)
    mapping(bytes32 => uint256[]) private baseVehicleMovements;
    mapping(bytes32 => uint256[]) private baseSparePartMovements;
    mapping(bytes32 => uint256[]) private baseMaintenanceRecords;

    // ───────── Events ─────────

    event BaseAdminRegistered(bytes32 indexed baseId, address admin);
    event BaseAdminRevoked(bytes32 indexed baseId, address admin);

    event VehicleMovementRecorded(
        uint256 indexed id,
        bytes32 indexed baseId,
        string  vehicleNumber,
        MovementType movementType,
        int256  quantityChange,
        address recordedBy,
        uint256 timestamp
    );

    event SparePartMovementRecorded(
        uint256 indexed id,
        bytes32 indexed baseId,
        string  partCode,
        MovementType movementType,
        int256  quantityChange,
        address recordedBy,
        uint256 timestamp
    );

    event MaintenanceRecordAdded(
        uint256 indexed id,
        bytes32 indexed baseId,
        string  vehicleNumber,
        address recordedBy,
        uint256 timestamp
    );

    event EntryValidated(uint256 indexed entryId, string entryType);
    event EntryRejected(uint256 indexed entryId, string entryType, string reason);

    // ───────── Modifiers ─────────

    modifier onlySuperAdmin() {
        require(msg.sender == superAdmin, "Only Super Admin");
        _;
    }

    /**
     * @dev Core access control for all write operations.
     *      - Super Admin → always allowed, uses the provided _baseId.
     *      - Base Admin  → allowed ONLY if _baseId matches their registered base.
     *      - Anyone else → reverted.
     */
    modifier onlyAuthorisedForBase(bytes32 _baseHash) {
        if (msg.sender == superAdmin) {
            // Super Admin can write to any base
            _;
        } else if (isAuthorisedAdmin[msg.sender]) {
            // Base Admin must write to their own base only
            require(
                adminToBase[msg.sender] == _baseHash,
                "Base Admin can only write to own base"
            );
            _;
        } else {
            revert("Not authorised - must be Super Admin or registered Base Admin");
        }
    }

    // ───────── Constructor ─────────

    constructor() {
        superAdmin = msg.sender;
    }

    // ═══════════ ADMIN MANAGEMENT ═══════════

    /**
     * @notice Register a wallet as a Base Admin for a given base.
     * @param _baseId   Human-readable base identifier (hashed on-chain).
     * @param _admin    Wallet address of the base admin.
     */
    function registerBaseAdmin(string calldata _baseId, address _admin)
        external onlySuperAdmin
    {
        bytes32 baseHash = keccak256(abi.encodePacked(_baseId));

        baseAdmins[baseHash]        = _admin;
        isAuthorisedAdmin[_admin]   = true;
        adminToBase[_admin]         = baseHash;

        emit BaseAdminRegistered(baseHash, _admin);
    }

    /**
     * @notice Revoke a Base Admin's access.
     */
    function revokeBaseAdmin(address _admin) external onlySuperAdmin {
        bytes32 baseHash = adminToBase[_admin];

        isAuthorisedAdmin[_admin]   = false;
        baseAdmins[baseHash]        = address(0);
        adminToBase[_admin]         = bytes32(0);

        emit BaseAdminRevoked(baseHash, _admin);
    }

    // ═══════════ INTERNAL HELPER ═══════════

    /**
     * @dev Resolve which base a record belongs to.
     *      Super Admin must provide a valid _baseId.
     *      Base Admin's _baseId is ignored- their registered base is used.
     */
    function _resolveBaseHash(string calldata _baseId)
        internal view
        returns (bytes32)
    {
        if (msg.sender == superAdmin) {
            // Super Admin: use the provided base ID (must not be empty)
            require(bytes(_baseId).length > 0, "Super Admin must specify base ID");
            return keccak256(abi.encodePacked(_baseId));
        } else {
            // Base Admin: always use their registered base (ignore _baseId param)
            return adminToBase[msg.sender];
        }
    }

    // ═══════════ LAYER 1- VEHICLE MOVEMENTS ═══════════

    /**
     * @notice Record a vehicle addition / removal / transfer.
     * @param _baseId          Base identifier. Base Admin's own base is enforced;
     *                         Super Admin can specify any base.
     * @param _vehicleNumber   Vehicle registration / identifier.
     * @param _movementType    ADDITION (0), REMOVAL (1), or TRANSFER (2).
     * @param _quantityChange  +ve for additions, -ve for removals.
     * @param _reason          Human-readable justification.
     */
    function addVehicleMovement(
        string calldata _baseId,
        string calldata _vehicleNumber,
        MovementType    _movementType,
        int256          _quantityChange,
        string calldata _reason
    )
        external
        onlyAuthorisedForBase(keccak256(abi.encodePacked(_baseId)))
        returns (uint256 movementId)
    {
        require(bytes(_vehicleNumber).length > 0, "Vehicle number required");
        require(bytes(_reason).length > 0,        "Reason required");

        vehicleMovementCount++;
        movementId = vehicleMovementCount;

        bytes32 baseHash = _resolveBaseHash(_baseId);

        vehicleMovements[movementId] = VehicleMovement({
            id:             movementId,
            baseId:         baseHash,
            vehicleNumber:  _vehicleNumber,
            movementType:   _movementType,
            quantityChange: _quantityChange,
            reason:         _reason,
            recordedBy:     msg.sender,
            timestamp:      block.timestamp,
            status:         RecordStatus.VALIDATED
        });

        vehicleHistory[keccak256(abi.encodePacked(_vehicleNumber))].push(movementId);
        baseVehicleMovements[baseHash].push(movementId);

        emit VehicleMovementRecorded(
            movementId, baseHash, _vehicleNumber,
            _movementType, _quantityChange,
            msg.sender, block.timestamp
        );

        emit EntryValidated(movementId, "VEHICLE_MOVEMENT");

        return movementId;
    }

    // ═══════════ LAYER 1- SPARE PART MOVEMENTS ═══════════

    /**
     * @notice Record a spare-part stock change.
     * @param _baseId   Base identifier (enforced per role).
     */
    function addSparePartMovement(
        string calldata _baseId,
        string calldata _partCode,
        string calldata _partName,
        MovementType    _movementType,
        int256          _quantityChange,
        string calldata _reason
    )
        external
        onlyAuthorisedForBase(keccak256(abi.encodePacked(_baseId)))
        returns (uint256 movementId)
    {
        require(bytes(_partCode).length > 0,  "Part code required");
        require(bytes(_reason).length > 0,    "Reason required");

        sparePartMovementCount++;
        movementId = sparePartMovementCount;

        bytes32 baseHash = _resolveBaseHash(_baseId);

        sparePartMovements[movementId] = SparePartMovement({
            id:             movementId,
            baseId:         baseHash,
            partCode:       _partCode,
            partName:       _partName,
            movementType:   _movementType,
            quantityChange: _quantityChange,
            reason:         _reason,
            recordedBy:     msg.sender,
            timestamp:      block.timestamp,
            status:         RecordStatus.VALIDATED
        });

        sparePartHistory[keccak256(abi.encodePacked(_partCode))].push(movementId);
        baseSparePartMovements[baseHash].push(movementId);

        emit SparePartMovementRecorded(
            movementId, baseHash, _partCode,
            _movementType, _quantityChange,
            msg.sender, block.timestamp
        );

        emit EntryValidated(movementId, "SPARE_PART_MOVEMENT");

        return movementId;
    }

    // ═══════════ LAYER 1- MAINTENANCE RECORDS ═══════════

    /**
     * @notice Log a maintenance activity for a vehicle.
     * @param _baseId   Base identifier (enforced per role).
     */
    function addMaintenanceRecord(
        string calldata   _baseId,
        string calldata   _vehicleNumber,
        string calldata   _description,
        string[] calldata _partsUsed,
        uint256           _costEstimate
    )
        external
        onlyAuthorisedForBase(keccak256(abi.encodePacked(_baseId)))
        returns (uint256 recordId)
    {
        require(bytes(_vehicleNumber).length > 0, "Vehicle number required");
        require(bytes(_description).length > 0,   "Description required");

        maintenanceRecordCount++;
        recordId = maintenanceRecordCount;

        bytes32 baseHash = _resolveBaseHash(_baseId);

        MaintenanceRecord storage rec = maintenanceRecords[recordId];
        rec.id            = recordId;
        rec.baseId        = baseHash;
        rec.vehicleNumber = _vehicleNumber;
        rec.description   = _description;
        rec.costEstimate  = _costEstimate;
        rec.recordedBy    = msg.sender;
        rec.timestamp     = block.timestamp;
        rec.status        = RecordStatus.VALIDATED;

        for (uint256 i = 0; i < _partsUsed.length; i++) {
            rec.partsUsed.push(_partsUsed[i]);
        }

        vehicleMaintenanceHistory[keccak256(abi.encodePacked(_vehicleNumber))].push(recordId);
        baseMaintenanceRecords[baseHash].push(recordId);

        emit MaintenanceRecordAdded(
            recordId, baseHash, _vehicleNumber,
            msg.sender, block.timestamp
        );

        emit EntryValidated(recordId, "MAINTENANCE_RECORD");

        return recordId;
    }

    // ═══════════ READ FUNCTIONS (HISTORY) ═══════════

    /**
     * @notice Get all movement IDs for a vehicle number.
     */
    function getVehicleHistory(string calldata _vehicleNumber)
        external view
        returns (uint256[] memory)
    {
        return vehicleHistory[keccak256(abi.encodePacked(_vehicleNumber))];
    }

    /**
     * @notice Get all maintenance record IDs for a vehicle.
     */
    function getVehicleMaintenanceHistory(string calldata _vehicleNumber)
        external view
        returns (uint256[] memory)
    {
        return vehicleMaintenanceHistory[keccak256(abi.encodePacked(_vehicleNumber))];
    }

    /**
     * @notice Get all movement IDs for a spare part code.
     */
    function getSparePartHistory(string calldata _partCode)
        external view
        returns (uint256[] memory)
    {
        return sparePartHistory[keccak256(abi.encodePacked(_partCode))];
    }

    /**
     * @notice Get all vehicle movement IDs for a specific base.
     */
    function getBaseVehicleMovements(string calldata _baseId)
        external view
        returns (uint256[] memory)
    {
        return baseVehicleMovements[keccak256(abi.encodePacked(_baseId))];
    }

    /**
     * @notice Get all spare part movement IDs for a specific base.
     */
    function getBaseSparePartMovements(string calldata _baseId)
        external view
        returns (uint256[] memory)
    {
        return baseSparePartMovements[keccak256(abi.encodePacked(_baseId))];
    }

    /**
     * @notice Get all maintenance record IDs for a specific base.
     */
    function getBaseMaintenanceRecords(string calldata _baseId)
        external view
        returns (uint256[] memory)
    {
        return baseMaintenanceRecords[keccak256(abi.encodePacked(_baseId))];
    }

    /**
     * @notice Return full details of a vehicle movement by ID.
     */
    function getVehicleMovementDetails(uint256 _id)
        external view
        returns (
            bytes32   baseId,
            string memory vehicleNumber,
            MovementType  movementType,
            int256    quantityChange,
            string memory reason,
            address   recordedBy,
            uint256   timestamp,
            RecordStatus  status
        )
    {
        VehicleMovement storage m = vehicleMovements[_id];
        return (
            m.baseId, m.vehicleNumber, m.movementType,
            m.quantityChange, m.reason, m.recordedBy,
            m.timestamp, m.status
        );
    }

    /**
     * @notice Return full details of a spare part movement by ID.
     */
    function getSparePartMovementDetails(uint256 _id)
        external view
        returns (
            bytes32   baseId,
            string memory partCode,
            string memory partName,
            MovementType  movementType,
            int256    quantityChange,
            string memory reason,
            address   recordedBy,
            uint256   timestamp,
            RecordStatus  status
        )
    {
        SparePartMovement storage m = sparePartMovements[_id];
        return (
            m.baseId, m.partCode, m.partName, m.movementType,
            m.quantityChange, m.reason, m.recordedBy,
            m.timestamp, m.status
        );
    }

    /**
     * @notice Return full details of a maintenance record by ID.
     */
    function getMaintenanceRecordDetails(uint256 _id)
        external view
        returns (
            bytes32    baseId,
            string memory vehicleNumber,
            string memory description,
            string[] memory partsUsed,
            uint256    costEstimate,
            address    recordedBy,
            uint256    timestamp,
            RecordStatus   status
        )
    {
        MaintenanceRecord storage r = maintenanceRecords[_id];
        return (
            r.baseId, r.vehicleNumber, r.description,
            r.partsUsed, r.costEstimate, r.recordedBy,
            r.timestamp, r.status
        );
    }

    // ═══════════ UTILITY ═══════════

    /**
     * @notice Total on-chain entries across all three categories.
     */
    function getTotalEntries() external view returns (uint256) {
        return vehicleMovementCount + sparePartMovementCount + maintenanceRecordCount;
    }

    /**
     * @notice Check whether an address is the Super Admin.
     */
    function isSuperAdmin(address _addr) external view returns (bool) {
        return _addr == superAdmin;
    }
}
