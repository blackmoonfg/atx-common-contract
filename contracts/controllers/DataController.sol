pragma solidity ^0.4.18;


import "bmc-contract/contracts/core/lib/SafeMath.sol";
import "bmc-contract/contracts/core/common/Object.sol";
import "../asset/ATxAssetProxy.sol";
import "./DataControllerEmitter.sol";
import "./ServiceController.sol";


/// @title Provides possibility manage holders? country limits and limits for holders.
contract DataController is Object, DataControllerEmitter {

    /* CONSTANTS */

    uint constant DATA_CONTROLLER = 109000;
    uint constant DATA_CONTROLLER_ERROR = DATA_CONTROLLER + 1;
    uint constant DATA_CONTROLLER_CURRENT_WRONG_LIMIT = DATA_CONTROLLER + 2;
    uint constant DATA_CONTROLLER_WRONG_ALLOWANCE = DATA_CONTROLLER + 3;
    uint constant DATA_CONTROLLER_COUNTRY_CODE_ALREADY_EXISTS = DATA_CONTROLLER + 4;

    uint constant MAX_TOKEN_HOLDER_NUMBER = 2 ** 256 - 1;

    using SafeMath for uint;

    /* STRUCTS */

    /// @title HoldersData couldn't be public because of internal structures, so needed to provide getters for different parts of _holderData
    struct HoldersData {
        uint countryCode;
        uint sendLimPerDay;
        uint sendLimPerMonth;
        bool operational;
        bytes text;
        uint holderAddressCount;
        mapping(uint => address) index2Address;
        mapping(address => uint) address2Index;
    }

    struct CountryLimits {
        uint countryCode;
        uint maxTokenHolderNumber;
        uint currentTokenHolderNumber;
    }

    /* FIELDS */

    address public withdrawal;
    address assetAddress;
    address public serviceController;

    mapping(bytes4 => mapping(address => bool)) public oracles;

    mapping(address => uint) public allowance;

    // Iterable mapping pattern is used for holders.
    /// @dev This is an access address mapping. Many addresses may have access to a single holder.
    uint public holdersCount;
    mapping(uint => HoldersData) holders;
    mapping(address => bytes32) holderAddress2Id;
    mapping(bytes32 => uint) public holderIndex;

    // This is an access address mapping. Many addresses may have access to a single holder.
    uint public countriesCount;
    mapping(uint => CountryLimits) countryLimitsList;
    mapping(uint => uint) countryIndex;

    /* MODIFIERS */

    modifier onlyWithdrawal {
        if (msg.sender != withdrawal) {
            revert();
        }
        _;
    }

    modifier onlyAsset {
        if (msg.sender == assetAddress) {
            _;
        }
    }

    modifier onlyOracleOrOwner {
        if (oracles[msg.sig][msg.sender] || msg.sender == contractOwner) {
            _;
        }
    }

    /// @notice Constructor for _holderData controller.
    /// @param _serviceController service controller
    function DataController(address _serviceController, address _asset) public {
        require(_serviceController != 0x0);
        require(_asset != 0x0);

        serviceController = _serviceController;
        assetAddress = _asset;
    }

    function() payable public {
        revert();
    }

    function setWithdraw(address _withdrawal) onlyContractOwner external returns (uint) {
        require(_withdrawal != 0x0);
        withdrawal = _withdrawal;
        return OK;
    }

    function addOracles(bytes4[] _signatures, address[] _oracles) onlyContractOwner external returns (uint) {
        require(_signatures.length == _oracles.length);
        bytes4 _sig;
        address _oracle;
        for (uint _idx = 0; _idx < _signatures.length; ++_idx) {
            (_sig, _oracle) = (_signatures[_idx], _oracles[_idx]);
            if (!oracles[_sig][_oracle]) {
                oracles[_sig][_oracle] = true;
                _emitOracleAdded(_sig, _oracle);
            }
        }
        return OK;
    }

    function removeOracles(bytes4[] _signatures, address[] _oracles) onlyContractOwner external returns (uint) {
        require(_signatures.length == _oracles.length);
        bytes4 _sig;
        address _oracle;
        for (uint _idx = 0; _idx < _signatures.length; ++_idx) {
            (_sig, _oracle) = (_signatures[_idx], _oracles[_idx]);
            if (oracles[_sig][_oracle]) {
                delete oracles[_sig][_oracle];
                _emitOracleRemoved(_sig, _oracle);
            }
        }
        return OK;
    }

    function getPendingManager() public view returns (address) {
        return ServiceController(serviceController).getPendingManager();
    }

    function getHolderInfo(bytes32 _externalHolderId) public view returns (
        uint _countryCode,
        uint _limPerDay,
        uint _limPerMonth,
        bool _operational,
        bytes _text
    ) {
        HoldersData storage _data = holders[holderIndex[_externalHolderId]];
        return (_data.countryCode, _data.sendLimPerDay, _data.sendLimPerMonth, _data.operational, _data.text);
    }

    function getHolderAddresses(bytes32 _externalHolderId) public view returns (address[] _addresses) {
        HoldersData storage _holderData = holders[holderIndex[_externalHolderId]];
        uint _addressesCount = _holderData.holderAddressCount;
        _addresses = new address[](_addressesCount);
        for (uint _holderAddressIdx = 0; _holderAddressIdx < _addressesCount; ++_holderAddressIdx) {
            _addresses[_holderAddressIdx] = _holderData.index2Address[_holderAddressIdx + 1];
        }
    }

    function getHolderCountryCode(bytes32 _externalHolderId) public view returns (uint) {
        return holders[holderIndex[_externalHolderId]].countryCode;
    }

    function getHolderExternalIdByAddress(address _address) public view returns (bytes32) {
        return holderAddress2Id[_address];
    }

    /// @notice Checks user is holder.
    /// @param _address checking address.
    /// @return `true` if _address is registered holder, `false` otherwise.
    function isRegisteredAddress(address _address) public view returns (bool) {
        return holderIndex[holderAddress2Id[_address]] != 0;
    }

    function isHolderOwnAddress(bytes32 _externalHolderId, address _address) public view returns (bool) {
        uint _holderIndex = holderIndex[_externalHolderId];
        if (_holderIndex == 0) {
            return false;
        }
        return holders[_holderIndex].address2Index[_address] != 0;
    }

    function getCountryInfo(uint _countryCode) public view returns (uint _maxHolderNumber, uint _currentHolderCount) {
        CountryLimits storage _data = countryLimitsList[countryIndex[_countryCode]];
        return (_data.maxTokenHolderNumber, _data.currentTokenHolderNumber);
    }

    function getCountryLimit(uint _countryCode) public view returns (uint limit) {
        uint _index = countryIndex[_countryCode];
        require(_index != 0);
        return countryLimitsList[_index].maxTokenHolderNumber;
    }

    function addCountryCode(uint _countryCode) onlyContractOwner public returns (uint) {
        var (,_created) = _createCountryId(_countryCode);
        if (!_created) {
            return _emitError(DATA_CONTROLLER_COUNTRY_CODE_ALREADY_EXISTS);
        }
        return OK;
    }

    /// @notice Returns holder id for the specified address, creates it if needed.
    /// @param _externalHolderId holder address.
    /// @param _countryCode country code.
    /// @return error code.
    function registerHolder(bytes32 _externalHolderId, address _holderAddress, uint _countryCode) onlyOracleOrOwner external returns (uint) {
        require(_holderAddress != 0x0);
        uint _holderIndex = holderIndex[holderAddress2Id[_holderAddress]];
        require(_holderIndex == 0);

        _createCountryId(_countryCode);
        _holderIndex = holdersCount.add(1);
        holdersCount = _holderIndex;

        HoldersData storage _holderData = holders[_holderIndex];
        _holderData.countryCode = _countryCode;
        _holderData.operational = true;
        _holderData.sendLimPerDay = MAX_TOKEN_HOLDER_NUMBER;
        _holderData.sendLimPerMonth = MAX_TOKEN_HOLDER_NUMBER;
        uint _firstAddressIndex = 1;
        _holderData.holderAddressCount = _firstAddressIndex;
        _holderData.address2Index[_holderAddress] = _firstAddressIndex;
        _holderData.index2Address[_firstAddressIndex] = _holderAddress;
        holderIndex[_externalHolderId] = _holderIndex;
        holderAddress2Id[_holderAddress] = _externalHolderId;

        _emitHolderRegistered(_externalHolderId, _holderIndex, _countryCode);
        return OK;
    }

    /// @notice Adds new address equivalent to holder.
    /// @param _externalHolderId external holder identifier.
    /// @param _newAddress adding address.
    /// @return error code.
    function addHolderAddress(bytes32 _externalHolderId, address _newAddress) onlyOracleOrOwner external returns (uint) {
        uint _holderIndex = holderIndex[_externalHolderId];
        require(_holderIndex != 0);

        uint _newAddressId = holderIndex[holderAddress2Id[_newAddress]];
        require(_newAddressId == 0);

        HoldersData storage _holderData = holders[_holderIndex];

        if (_holderData.address2Index[_newAddress] == 0) {
            _holderData.holderAddressCount = _holderData.holderAddressCount.add(1);
            _holderData.address2Index[_newAddress] = _holderData.holderAddressCount;
            _holderData.index2Address[_holderData.holderAddressCount] = _newAddress;
        }

        holderAddress2Id[_newAddress] = _externalHolderId;

        _emitHolderAddressAdded(_externalHolderId, _newAddress, _holderIndex);
        return OK;
    }

    /// @notice Remove an address owned by a holder.
    /// @param _externalHolderId external holder identifier.
    /// @param _address removing address.
    /// @return error code.
    function removeHolderAddress(bytes32 _externalHolderId, address _address) onlyOracleOrOwner external returns (uint) {
        uint _holderIndex = holderIndex[_externalHolderId];
        require(_holderIndex != 0);

        HoldersData storage _holderData = holders[_holderIndex];

        uint _tempIndex = _holderData.address2Index[_address];
        require(_tempIndex != 0);

        address _lastAddress = _holderData.index2Address[_holderData.holderAddressCount];
        _holderData.address2Index[_lastAddress] = _tempIndex;
        _holderData.index2Address[_tempIndex] = _lastAddress;
        delete _holderData.address2Index[_address];
        _holderData.holderAddressCount = _holderData.holderAddressCount.sub(1);

        delete holderAddress2Id[_address];

        _emitHolderAddressRemoved(_externalHolderId, _address, _holderIndex);
        return OK;
    }

    /// @notice Change operational status for holder.
    /// Can be accessed by contract owner or oracle only.
    ///
    /// @param _externalHolderId external holder identifier.
    /// @param _operational operational status.
    ///
    /// @return result code.
    function changeOperational(bytes32 _externalHolderId, bool _operational) onlyOracleOrOwner external returns (uint) {
        uint _holderIndex = holderIndex[_externalHolderId];
        require(_holderIndex != 0);

        holders[_holderIndex].operational = _operational;

        _emitHolderOperationalChanged(_externalHolderId, _operational);
        return OK;
    }

    /// @notice Changes text for holder.
    /// Can be accessed by contract owner or oracle only.
    ///
    /// @param _externalHolderId external holder identifier.
    /// @param _text changing text.
    ///
    /// @return result code.
    function updateTextForHolder(bytes32 _externalHolderId, bytes _text) onlyOracleOrOwner external returns (uint) {
        uint _holderIndex = holderIndex[_externalHolderId];
        require(_holderIndex != 0);

        holders[_holderIndex].text = _text;
        return OK;
    }

    /// @notice Updates limit per day for holder.
    ///
    /// Can be accessed by contract owner only.
    ///
    /// @param _externalHolderId external holder identifier.
    /// @param _limit limit value.
    ///
    /// @return result code.
    function updateLimitPerDay(bytes32 _externalHolderId, uint _limit) onlyOracleOrOwner external returns (uint) {
        uint _holderIndex = holderIndex[_externalHolderId];
        require(_holderIndex != 0);

        uint _currentLimit = holders[_holderIndex].sendLimPerDay;
        holders[_holderIndex].sendLimPerDay = _limit;

        _emitDayLimitChanged(_externalHolderId, _currentLimit, _limit);
        return OK;
    }

    /// @notice Updates limit per month for holder.
    /// Can be accessed by contract owner or oracle only.
    ///
    /// @param _externalHolderId external holder identifier.
    /// @param _limit limit value.
    ///
    /// @return result code.
    function updateLimitPerMonth(bytes32 _externalHolderId, uint _limit) onlyOracleOrOwner external returns (uint) {
        uint _holderIndex = holderIndex[_externalHolderId];
        require(_holderIndex != 0);

        uint _currentLimit = holders[_holderIndex].sendLimPerDay;
        holders[_holderIndex].sendLimPerMonth = _limit;

        _emitMonthLimitChanged(_externalHolderId, _currentLimit, _limit);
        return OK;
    }

    /// @notice Change country limits.
    /// Can be accessed by contract owner or oracle only.
    ///
    /// @param _countryCode country code.
    /// @param _limit limit value.
    ///
    /// @return result code.
    function changeCountryLimit(uint _countryCode, uint _limit) onlyOracleOrOwner external returns (uint) {
        uint _countryIndex = countryIndex[_countryCode];
        require(_countryIndex != 0);

        uint _currentTokenHolderNumber = countryLimitsList[_countryIndex].currentTokenHolderNumber;
        if (_currentTokenHolderNumber > _limit) {
            return DATA_CONTROLLER_CURRENT_WRONG_LIMIT;
        }

        countryLimitsList[_countryIndex].maxTokenHolderNumber = _limit;
        
        _emitCountryCodeChanged(_countryIndex, _countryCode, _limit);
        return OK;
    }

    function withdrawFrom(address _holderAddress, uint _value) public onlyAsset returns (uint) {
        bytes32 _externalHolderId = holderAddress2Id[_holderAddress];
        HoldersData storage _holderData = holders[holderIndex[_externalHolderId]];
        _holderData.sendLimPerDay = _holderData.sendLimPerDay.sub(_value);
        _holderData.sendLimPerMonth = _holderData.sendLimPerMonth.sub(_value);
        return OK;
    }

    function depositTo(address _holderAddress, uint _value) public onlyAsset returns (uint) {
        bytes32 _externalHolderId = holderAddress2Id[_holderAddress];
        HoldersData storage _holderData = holders[holderIndex[_externalHolderId]];
        _holderData.sendLimPerDay = _holderData.sendLimPerDay.add(_value);
        _holderData.sendLimPerMonth = _holderData.sendLimPerMonth.add(_value);
        return OK;
    }

    function updateCountryHoldersCount(uint _countryCode, uint _updatedHolderCount) public onlyAsset returns (uint) {
        CountryLimits storage _data = countryLimitsList[countryIndex[_countryCode]];
        assert(_data.maxTokenHolderNumber >= _updatedHolderCount);
        _data.currentTokenHolderNumber = _updatedHolderCount;
        return OK;
    }

    function changeAllowance(address _from, uint _value) public onlyWithdrawal returns (uint) {
        ServiceController _serviceController = ServiceController(serviceController);
        ATxAssetProxy token = ATxAssetProxy(_serviceController.proxy());
        if (token.balanceOf(_from) < _value) {
            return DATA_CONTROLLER_WRONG_ALLOWANCE;
        }
        allowance[_from] = _value;
        return OK;
    }

    function _createCountryId(uint _countryCode) internal returns (uint, bool _created) {
        uint countryId = countryIndex[_countryCode];
        if (countryId == 0) {
            uint _countriesCount = countriesCount;
            countryId = _countriesCount.add(1);
            countriesCount = countryId;
            CountryLimits storage limits = countryLimitsList[countryId];
            limits.countryCode = _countryCode;
            limits.maxTokenHolderNumber = MAX_TOKEN_HOLDER_NUMBER;

            countryIndex[_countryCode] = countryId;
            _emitCountryCodeAdded(countryIndex[_countryCode], _countryCode, MAX_TOKEN_HOLDER_NUMBER);

            _created = true;
        }

        return (countryId, _created);
    }
}
