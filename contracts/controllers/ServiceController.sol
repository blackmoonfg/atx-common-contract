pragma solidity ^0.4.11;


import "bmc-contract/contracts/core/common/Owned.sol";
import "bmc-contract/contracts/atx/controllers/MultiSigAdapter.sol";


/// @title ServiceController
///
/// Base implementation
/// Serves for managing service instances
contract ServiceController is MultiSigAdapter {

    uint constant SERVICE_CONTROLLER = 350000;
    uint constant SERVICE_CONTROLLER_EMISSION_EXIST = SERVICE_CONTROLLER + 1;
    uint constant SERVICE_CONTROLLER_BURNING_MAN_EXIST = SERVICE_CONTROLLER + 2;
    uint constant SERVICE_CONTROLLER_ALREADY_INITIALIZED = SERVICE_CONTROLLER + 3;

    address public profiterole;
    address public treasury;
    address public pendingManager;
    address public proxy;

    mapping(address => bool) emissionProviders;
    mapping(address => bool) burningMans;

    /// @notice Default ServiceController's constructor
    ///
    /// @param _pendingManager pending manager address
    /// @param _proxy ERC20 proxy address
    /// @param _profiterole profiterole address
    /// @param _treasury treasury address
    function ServiceController(address _pendingManager, address _proxy, address _profiterole, address _treasury) public {
        require(_pendingManager != 0x0);
        require(_proxy != 0x0);
        require(_profiterole != 0x0);
        require(_treasury != 0x0);
        pendingManager = _pendingManager;
        proxy = _proxy;
        profiterole = _profiterole;
        treasury = _treasury;
    }

    /// @notice Return pending manager address
    ///
    /// @return code
    function getPendingManager() public view returns (address) {
        return pendingManager;
    }

    /// @notice Add emission provider
    ///
    /// @param _provider emission provider address
    ///
    /// @return code
    function addEmissionProvider(address _provider, uint _block) public returns (uint _code) {
        if (emissionProviders[_provider]) {
            return SERVICE_CONTROLLER_EMISSION_EXIST;
        }
        _code = _multisig(keccak256(_provider), _block);
        if (OK != _code) {
            return _code;
        }

        emissionProviders[_provider] = true;
        return OK;
    }

    /// @notice Remove emission provider
    ///
    /// @param _provider emission provider address
    ///
    /// @return code
    function removeEmissionProvider(address _provider, uint _block) public returns (uint _code) {
        _code = _multisig(keccak256(_provider), _block);
        if (OK != _code) {
            return _code;
        }

        delete emissionProviders[_provider];
        return OK;
    }

    /// @notice Add burning man
    ///
    /// @param _burningMan burning man address
    ///
    /// @return code
    function addBurningMan(address _burningMan, uint _block) public returns (uint _code) {
        if (burningMans[_burningMan]) {
            return SERVICE_CONTROLLER_BURNING_MAN_EXIST;
        }

        _code = _multisig(keccak256(_burningMan), _block);
        if (OK != _code) {
            return _code;
        }

        burningMans[_burningMan] = true;
        return OK;
    }

    /// @notice Remove burning man
    ///
    /// @param _burningMan burning man address
    ///
    /// @return code
    function removeBurningMan(address _burningMan, uint _block) public returns (uint _code) {
        _code = _multisig(keccak256(_burningMan), _block);
        if (OK != _code) {
            return _code;
        }

        delete burningMans[_burningMan];
        return OK;
    }

    /// @notice Update a profiterole address
    ///
    /// @param _profiterole profiterole address
    ///
    /// @return result code of an operation
    function updateProfiterole(address _profiterole, uint _block) public returns (uint _code) {
        _code = _multisig(keccak256(_profiterole), _block);
        if (OK != _code) {
            return _code;
        }

        profiterole = _profiterole;
        return OK;
    }

    /// @notice Update a treasury address
    ///
    /// @param _treasury treasury address
    ///
    /// @return result code of an operation
    function updateTreasury(address _treasury, uint _block) public returns (uint _code) {
        _code = _multisig(keccak256(_treasury), _block);
        if (OK != _code) {
            return _code;
        }

        treasury = _treasury;
        return OK;
    }

    /// @notice Update pending manager address
    ///
    /// @param _pendingManager pending manager address
    ///
    /// @return result code of an operation
    function updatePendingManager(address _pendingManager, uint _block) public returns (uint _code) {
        _code = _multisig(keccak256(_pendingManager), _block);
        if (OK != _code) {
            return _code;
        }

        pendingManager = _pendingManager;
        return OK;
    }

    /// @notice Check target address is service
    ///
    /// @param _address target address
    ///
    /// @return `true` when an address is a service, `false` otherwise
    function isService(address _address) public view returns (bool check) {
        return _address == profiterole || _address == treasury || _address == proxy || _address == pendingManager || emissionProviders[_address] || burningMans[_address];
    }
}
