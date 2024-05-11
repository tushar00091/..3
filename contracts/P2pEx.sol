//SPDX-License-Identifier: UNLICENSED

// Solidity files have to start with this pragma.
// It will be used by the Solidity compiler to validate its version.
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

contract P2pEx is Ownable {

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////PROVIDER PROPERTIES AND CRUD FUNCTIONS///////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    struct Provider {
        address myAddress;
        bool isAvailable;
        //Time limit chosen by the provider during which the transaction will be completed(<= 4hours). Auto-comple is triggered if exceeded.
        int autoCompleteTimeLimit;
        //String in this format "payment method**currency accepted**transfer details". '**' separator to split for display.
        string[][] paymtMthds;
        //List of tokens that are deposited in contract with balance > 0
        address[] currTradedTokens;
    }

//Providers props
    // For each provider, each token is mapped to its index from provider.currTradedTokens
    mapping (address => mapping (address => uint)) private idxOfCurrTradedTokensByProvider;
    mapping(address => Provider) private providers;
    //      (Provider =>         (Token => tradeableAmount)). 
    mapping (address => mapping (address => uint)) private depositedAmountByTokenByProvider;
    //      (Provider =>         (Token => tradeableAmount)). tradeable amount currently used in orders with status InProgress
    mapping (address => mapping (address => uint)) private inProgressAmountByTokenByProvider;
    //      (Provider =>         (Token => tradeableAmount)). tradeable amount currently used in orders with status Disputed 
    mapping (address => mapping (address => uint)) private disputedAmountByTokenByProvider;
    //tracks addresses of registered providers. Not always up-to-date. Needs updateProvidersAddrs() to be run to be up-to-date.
    address[] private providersAddrs;
    //tracks number of currently registered providers. Updated after each addition or deletion. Always up-to-date.
    uint private registeredProvidersCount;
    //Max allowed time for a provider to send the tokens to the receiver after it has been marked 'PAID'(fiat sent) by the latter 
    int private maxTimeLimit = 4 hours;
    // Contract's list of accepted tokens
    address[] private tradeableTokensLst;
    // Each token is mapped to its index from tradeableTokensLst
    mapping (address => uint) private tradeableTokens;

//String errors returned by contract functions
    string constant PROVIDER_ERROR = "provider error";
    string constant PYMT_MTHD_ERROR = "payment method error";
    string constant MAX_REACHED = "Max allowed reached";
    string constant LTD_TO_4HOURS = "Must be 4 hours or less";
    string constant TRANSFER_FAILED = "Transfer failed";
    string constant TOO_MANY = "Too many";
    string constant BALANCE_ERROR = "balance error";
    string constant ZERO_DEPOSITS_ERROR = "0 deposits error";
    string constant HAS_DEPOSITS_ERROR = "has deposits error";
    string constant TOKEN_ERROR = "Token error";
    uint8 constant MAX_PAYMT_MTHDS = 32;
    string constant ORDER_ERROR = "Order error";

    //*************************************************//
    //                  PURE FUNCTIONS                //

    //                   PURE FUNCTIONS                 //
    //*************************************************//


//                  HELPER FUNCTIONS                //

    
    function providerExists(address _provider) public view returns (bool) {
        return providers[_provider].myAddress == _provider;
    }

    /**
     * @dev 
     * @param _provider provider address
     */
    function hasAtLeastOneDeposit(address _provider) public view returns (bool) {
        address[] memory tknList = providers[_provider].currTradedTokens;

        return providerExists(_provider) && tknList.length > 0 && depositedAmountByTokenByProvider[_provider][tknList[0]] > 0;
    }

    function moderatorExists(address _moderator) public view returns (bool) {
        return moderators[_moderator].myAddress == _moderator;
    }
//*************************************************//

//                    MODIFIERS                     //

    modifier onlyProvider() {
        require(providerExists(_msgSender()), PROVIDER_ERROR);
        _;
    }

    modifier isProvider(address _provider) {
        require(providerExists(_provider), PROVIDER_ERROR);
        _;
    }

    modifier hasDeposit() {
        require(hasAtLeastOneDeposit(_msgSender()), ZERO_DEPOSITS_ERROR);
        _;
    }

    modifier hasPymtMthd(address _provider, uint8 _mthdIndex) {
        require(providers[_provider].paymtMthds.length > _mthdIndex, PYMT_MTHD_ERROR);
        _;
    }

    modifier isTradeable(address _token) {
        require(tradeableTokens[_token] != 0, TOKEN_ERROR);
        _;
    }

    modifier isCurrTraded(address _token, address _provider) {
        require(idxOfCurrTradedTokensByProvider[_provider][_token] != 0, TOKEN_ERROR);
        _;
    }

    modifier isModerator(address _moderator) {
        require(moderatorExists(_moderator));
        _;
    }
//*************************************************//

//              GET PROVIDER(S) FUNCTIONS           //
    /**
     * @dev Because providersAddrs is not always up-to-date, we check for address(0) addresses
     * @return currentProvidersAddys
     * Why: will be used to get info to display on front-end
     */
    function getProvidersAddys() public view returns (address[] memory currentProvidersAddys) {
        uint64 currentCounter = 0;
        for (uint count = 0; count < providersAddrs.length; count++) 
        {
            if (providers[providersAddrs[count]].myAddress == providersAddrs[count]) {
                currentProvidersAddys[currentCounter] = providersAddrs[count];
                currentCounter++;
            }
        }
        return currentProvidersAddys;
    }

    function getProvidersCount() public view returns (uint) {
        return registeredProvidersCount;
    }

    function getProvider(address _addr) public view isProvider(_addr) returns (Provider memory) {
        return providers[_addr];
    }

    function getProviderAddy(address _addr) public view isProvider(_addr) returns (address) {
        return providers[_addr].myAddress;
    }

    function getAllProviders() public view returns (Provider[] memory) {
        return getProviders(registeredProvidersCount, false);
    }

    function getAvailableProviders() public view returns (Provider[] memory) {
        uint availableCount = getProvidersCountByAvailability(true);
        return getProviders(availableCount, true);
    }

    function getUnavailableProviders() public view returns (Provider[] memory) {
        uint availableCount = getProvidersCountByAvailability(false);
        return getProviders(availableCount, false);
    }

    function getProviders(uint _expectedArrLength, bool _isAvailable) internal view returns (Provider[] memory) {
        Provider[] memory providersToGet = new Provider[](_expectedArrLength);
        uint providersToGetCount = 0;

        for (uint count = 0; count < providersAddrs.length; count++){
            address addyToFind = providersAddrs[count];

            if (providers[addyToFind].myAddress == addyToFind //Because providersAddrs will not always be up-to-date, we check that the provider exists
                    && ((!_isAvailable && !providers[addyToFind].isAvailable) //Unavailable providers only
                    || (_isAvailable && providers[addyToFind].isAvailable) //Available providers only
                    || _expectedArrLength == registeredProvidersCount)) { //All providers

                providersToGet[providersToGetCount] = providers[addyToFind];
                providersToGetCount++;
            }
        }

        return providersToGet;
    }

    function getProvidersCountByAvailability(bool isAvailable) internal view returns (uint) {
        uint counter = 0;
        for (uint count = 0; count < providersAddrs.length; count++){
            address addyToFind = providersAddrs[count];
            //Because providersAddrs will not be updated after each deleteProvider(), We make sure no null addresses are counted. Hence the first condition.
            if (providers[addyToFind].myAddress == addyToFind && providers[addyToFind].isAvailable == isAvailable) {
                counter++;
            }
        }

        return counter;
    }
//*************************************************//

//                 PROVIDER CRUD                 //
    function addProvider() public { // TESTED
        require(!providerExists(_msgSender()), PROVIDER_ERROR);
        providers[_msgSender()] = Provider(_msgSender(), false, maxTimeLimit, new string[][](0), new address[](0));
        providersAddrs.push(_msgSender());
        registeredProvidersCount++;
    }

    function updateProvider(bool _isAvailable, int _timeLimit, string[][] memory _paymtMthds) public onlyProvider {
        updateTimeLimit(_timeLimit);
        updateAvailability(_isAvailable);
        updateAllPaymtMthds(_paymtMthds);
    }

    function deleteProvider() public onlyProvider { // TESTED
        require(!hasAtLeastOneDeposit(_msgSender()), HAS_DEPOSITS_ERROR);
        // delete depositedAmountByTokenByProvider[_msgSender()];
        delete providers[_msgSender()];
        registeredProvidersCount--;
    }
//*************************************************//

//                 isAvailable CRUD                 // TESTED

    function getAvailability(address provider) external view returns (bool) {
        return providers[provider].isAvailable;
    }

    function becomeAvailable() external onlyProvider hasDeposit { // TESTED
        updateAvailability(true);
    }

    function becomeUnavailable() external onlyProvider { // TESTED
        updateAvailability(false);
    }

    function updateAvailability(bool _isAvailable) internal { // TESTED INDIRECTLY
        providers[_msgSender()].isAvailable = _isAvailable;
    }
//*************************************************//

//            autoCompleteTimeLimit                //
    function updateTimeLimit(int _timeLimit) public onlyProvider {
        require(_timeLimit <= maxTimeLimit, LTD_TO_4HOURS);
        providers[_msgSender()].autoCompleteTimeLimit = _timeLimit;
    }
//*************************************************//

//                 paymtMthds CRUD                  // TESTED

    function getPymtMthds(address _provider) public view isProvider(_provider) returns (string[][] memory) { // TESTED
        return providers[_provider].paymtMthds;
    }

    function getPymtMthd(address _provider, uint8 _mthdIndex) public view isProvider(_provider) hasPymtMthd(_provider, _mthdIndex) returns (string[] memory) {
        return providers[_provider].paymtMthds[_mthdIndex];
    }

    /**
     * @dev list for payment method details. always length of 3: [_name, _acceptedCurrency, _transferInfo]
     * _name like Google pay
     * _acceptedCurrencie should only contain a word consisting of 3 uppercase letters. Front end validation with Regex ^(?:\b[A-Z]{3}\b\s*)$
     * _transferInfo like an email or account number
     * @param _newpymtMthd always length of 3: [_name, _acceptedCurrency, _transferInfo]
     */
    function addPaymtMthd(string[] memory _newpymtMthd) public onlyProvider { // TESTED
        require(providers[_msgSender()].paymtMthds.length < MAX_PAYMT_MTHDS, MAX_REACHED);
        providers[_msgSender()].paymtMthds.push([_newpymtMthd[0], _newpymtMthd[1], _newpymtMthd[2]]);
    }

    /**
     * 
     * @param _mthdIndex of payment method to remove
     */
    function removePaymtMthd(uint8 _mthdIndex) public onlyProvider hasPymtMthd(_msgSender(), _mthdIndex) { // TESTED
        string[][] storage paymtMthds = providers[_msgSender()].paymtMthds;
        paymtMthds[_mthdIndex] = paymtMthds[paymtMthds.length - 1];
        paymtMthds.pop();
    }

    /**
     * 
     * @param _mthdIndex of payment method to update
     * @param _newPymtMthd of payment method to update
     */
    function updatePaymtMthd(uint8 _mthdIndex, string[] memory _newPymtMthd) public onlyProvider hasPymtMthd(_msgSender(), _mthdIndex) { // TESTED
        providers[_msgSender()].paymtMthds[_mthdIndex] = _newPymtMthd;
    }

    /**
     * 
     * @param _newPymtMthds of payment method to update
     */
    function updateAllPaymtMthds(string[][] memory _newPymtMthds) public onlyProvider { // TESTED
        require(providers[_msgSender()].paymtMthds.length == _newPymtMthds.length, PYMT_MTHD_ERROR);
        providers[_msgSender()].paymtMthds = _newPymtMthds;
    }
//*************************************************//

//              currTradedTokens CRUD              // TESTED

    function getCurrTradedTokens(address _provider) external view returns (address[] memory) {// TESTED
        return providers[_provider].currTradedTokens;
    }

    function getCurrTradedTokenIndex(address _token, address _provider) public view isProvider(_provider) isCurrTraded(_token, _provider) returns (uint) {
        return idxOfCurrTradedTokensByProvider[_provider][_token] - 1;// TESTED
    }

    function addToCurrTradedTokens(address _token) public onlyProvider isTradeable(_token) {// TESTED
        if (idxOfCurrTradedTokensByProvider[_msgSender()][_token] == 0) {//Token not yet added
            address[] storage tknLst = providers[_msgSender()].currTradedTokens;
            tknLst.push(_token);
            idxOfCurrTradedTokensByProvider[_msgSender()][_token] = tknLst.length;
        }
    }

    function removeFromCurrTradedTokens(address _token) public onlyProvider isCurrTraded(_token, _msgSender()) {// TESTED
        address[] storage tknLst = providers[_msgSender()].currTradedTokens;
        tknLst[getCurrTradedTokenIndex(_token, _msgSender())] = tknLst[tknLst.length - 1];
        tknLst.pop();
        delete idxOfCurrTradedTokensByProvider[_msgSender()][_token]; 
    }

//*************************************************//

    //update frequency to be be determined. Can also be OwnerOnly function
    function updateProvidersAddrs() public {
        for (uint count = 0; count < providersAddrs.length; count++) 
        {
            if (providers[providersAddrs[count]].myAddress != providersAddrs[count]) {
                providersAddrs[count] = providersAddrs[providersAddrs.length - 1];
                providersAddrs.pop();
            }
        }
    }
//*************************************************//

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////BECOME A PROVIDER REQUIREMENTS FUNCTIONS/////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

//*************************************************//
//            tradeableTokensLst CRUD             //

    function getTradeableTokensLst() public view returns (address[] memory) {
        return tradeableTokensLst;
    }

    function getTradeableTokenIndex(address _token) public view isTradeable(_token) returns (uint) {// TESTED
        return tradeableTokens[_token] - 1;
    }

    /**
     * @dev Because tradeableTokens[_NotYetAddedToken] will return 0(default uint value),
     * we map the new token added to the new length of tradeableTokensLst.
     * @param _newToken token to be added
     */
    function makeTokenTradeable(address _newToken) public onlyOwner() {// TESTED
        require(tradeableTokens[_newToken] == 0, TOKEN_ERROR);
        tradeableTokensLst.push(_newToken);
        tradeableTokens[_newToken] = tradeableTokensLst.length;
    }

    function removeTokenFromTrade(address _token) public onlyOwner isTradeable(_token) {
        tradeableTokensLst[getTradeableTokenIndex(_token)] = tradeableTokensLst[tradeableTokensLst.length - 1];
        tradeableTokensLst.pop();
        delete tradeableTokens[_token];
        // get providers that still have the token deposited in contract
        // send it back to their wallets  
    }
//*************************************************//

//*************************************************//

    function balanceOf(address _token) public view returns (uint256){
        return IERC20(_token).balanceOf(address(this));
    }

    function getDepositedAmountByTokenByProvider(address _token, address _provider) public view 
            isProvider(_provider) isCurrTraded(_token, _provider) returns (uint){
        return depositedAmountByTokenByProvider[_provider][_token];
    }

    /**
     * @dev Provider only has access to 90% to trade. 10% is held to pay for fees in case of a dispute resolved by a moderator
     * where the provider is at fault.
     */
    function getTradeableAmountByTokenByProvider(address _token, address _provider) private view returns (uint){
        return depositedAmountByTokenByProvider[_provider][_token] *90/100; 
    }

    function getAvailableAmountToTrade(address _token, address _provider) public view 
            isProvider(_provider) isCurrTraded(_token, _provider) returns (uint){
        return getTradeableAmountByTokenByProvider(_provider, _token) - inProgressAmountByTokenByProvider[_provider][_token] - disputedAmountByTokenByProvider[_provider][_token];
    }

    /**
     * 
     * @param _token from a drop-down-list generated from tradeableTokensLst.
     * @param _tradeAmount amount to be deposited in contract.
     */
    function depositToTrade(address _token, uint _tradeAmount) external payable onlyProvider isTradeable(_token) {
        require(IERC20(_token).transferFrom(_msgSender(), address(this), _tradeAmount), TRANSFER_FAILED);
        addToCurrTradedTokens(_token); // Only added if new
        depositedAmountByTokenByProvider[_msgSender()][_token] += _tradeAmount;
    }

//*************************************************//
//          Chainlink price feed        //

    /**
     * @notice Returns the latest price
     *
     * @return price
     */
    function getLatestPrice(address _priceFeed) public view returns (int256) {
        ( , int256 price, , , ) = AggregatorV3Interface(_priceFeed).latestRoundData();
        return price;
    }


//*************************************************//
// Transaction flow between Receiver and Provider //

    enum Status {
        InProgress,
        Completed,
        Cancelled,
        DisputedByReceiver, //order amount is disputed totally or partially. Only tx fees are charged to update the order and let the other party respond.
        DisputedByProvider,  
        DisputedWithMod //requires an amount equal to 10% of the order amount to be freezed from both parties.
                //A moderator takes over the order and will rule on who's liable. The liable party is charged 10%. the other party get it's 10% back. 
    }

    struct Order {
        uint256 orderId;
        address receiver;
        address provider;
        uint8 pmtMthdIdx;
        string fiatUsed;
        uint fiatAmountPaid;
        address cryptoToSend;
        uint cryptoAmountToSend;
        Status status;
        address moderator;//When order.status is DisputedWithMod, address is added to order. can only be assigned once. get deassigned after 2 hours.
    }

    // All orders
    Order[] private ordersLst;
    uint256 private ordersCount;

    /**
     * Modifiers
     */
    modifier isOrder(uint256 _orderId) {
        require(ordersLst[_orderId].orderId == _orderId, ORDER_ERROR);
        _;
    }

    modifier isOrderProvider(uint256 _orderId, address _provider) {
        require(ordersLst[_orderId].provider == _provider, ORDER_ERROR);
        _;
    }

    modifier isOrderReceiver(uint256 _orderId, address _receiver) {
        require(ordersLst[_orderId].receiver == _receiver, ORDER_ERROR);
        _;
    }

    modifier isOrderProviderOrReceiver(uint256 _orderId, address _msgSender) {
        require(ordersLst[_orderId].provider == _msgSender || ordersLst[_orderId].receiver == _msgSender, ORDER_ERROR);
        _;   
    }

    modifier canBeCancelled(uint256 _orderId) {
        require(Status.InProgress == ordersLst[_orderId].status ||
         Status.DisputedByReceiver == ordersLst[_orderId].status ||
         Status.DisputedByProvider == ordersLst[_orderId].status, ORDER_ERROR);
        _;
    }

    modifier canBeDisputed(uint256 _orderId, address _disputedBy) {
        if (ordersLst[_orderId].status == Status.InProgress) {
            require(ordersLst[_orderId].provider == _disputedBy, ORDER_ERROR);
        } else if (Status.DisputedByReceiver == ordersLst[_orderId].status || Status.DisputedByProvider == ordersLst[_orderId].status) {
            require(ordersLst[_orderId].provider == _disputedBy || ordersLst[_orderId].receiver == _disputedBy, ORDER_ERROR);
        } else {
            require(false, ORDER_ERROR);
        }
        _;
    }

    modifier canBeDisputedWithMod(uint256 _orderId) {
        require(Status.DisputedByReceiver == ordersLst[_orderId].status || Status.DisputedByProvider == ordersLst[_orderId].status, ORDER_ERROR);
        _;
    }

    modifier canBeAssigned(uint256 _orderId) {
        require(ordersLst[_orderId].status == Status.DisputedWithMod, ORDER_ERROR);
        _;
    }

    modifier canBeResolved(uint256 _orderId, address _resolvedBy) {
        if (Status.DisputedByReceiver == ordersLst[_orderId].status || Status.InProgress == ordersLst[_orderId].status) {
            require(ordersLst[_orderId].provider == _resolvedBy, ORDER_ERROR);
        } else if (ordersLst[_orderId].status == Status.DisputedByProvider) {
            require(ordersLst[_orderId].receiver == _resolvedBy, ORDER_ERROR);
        } else {
            require(false, ORDER_ERROR);
        }
        _;
    }

    modifier isOrderModerator(uint256 _orderId, address _moderator) {
        require(ordersLst[_orderId].moderator == _moderator, ORDER_ERROR);
        _;
    }

    modifier canBeResolvedWithMod(uint256 _orderId, address _resolvedBy) {
        require(ordersLst[_orderId].status == Status.DisputedWithMod, ORDER_ERROR);
        _;
        
    }

    /**
     * @dev Order has been initiated(InProgress): receiver made the payment. Waiting on provider to Complete or Dispute order.
     */
    function initiateOrder(address _provider, uint8 _pmtMthdIdx, uint _amountPaid, address _cryptoToSend, uint _cryptoAmountToSend) 
            public isProvider(_provider) hasPymtMthd(_provider, _pmtMthdIdx) {
        require(getAvailableAmountToTrade(_cryptoToSend, _provider) >= _cryptoAmountToSend, BALANCE_ERROR);
        ++ordersCount;
        string memory fiatUsed = providers[_provider].paymtMthds[_pmtMthdIdx][1];
        ordersLst[ordersCount] = Order(ordersCount, _msgSender(), _provider, _pmtMthdIdx, fiatUsed, _amountPaid, _cryptoToSend, _cryptoAmountToSend, Status.InProgress, address(0));
        //Decide how to organize orders. For now just use Order[] until the need for a mapping arises.
    }

    /**
     * @dev An order can only be completed by the provider.
     * When marked as Completed, the provider acknowledges the reception of the fiat transfer amount.
     * The crypto amount is then automatically transferred to the receiver wallet address.
     * The protocol fees are taken at this stage.
     */
    function completeOrder(uint256 _orderId, address _fromAdress) 
            internal isOrder(_orderId) isOrderProvider(_orderId, _msgSender()) {
        require(IERC20(ordersLst[_orderId].cryptoToSend).transferFrom(_fromAdress, ordersLst[_orderId].receiver, ordersLst[_orderId].cryptoAmountToSend), TRANSFER_FAILED);
        ordersLst[_orderId].status = Status.Completed;
    }

    /**
     * @dev The Crypto amount is transferred using the provider's balance in the contract.
     */
    function completeOrderFromDepositedAmount(uint256 _orderId) public {
        completeOrder(_orderId, address(this));
        depositedAmountByTokenByProvider[_msgSender()][ordersLst[_orderId].cryptoToSend] -= ordersLst[_orderId].cryptoAmountToSend;
    }

    /**
     * @dev The Crypto amount is transferred using the provider's wallet.
     * The provider's contract balance is not affected.
     */
    function completeOrderFromProviderWallet(uint256 _orderId) public {
        completeOrder(ordersLst[_orderId].orderId, _msgSender());
    }

    /**
     * @dev Order can be cancelled anytime by the receiver as long as it's in progress or disputed. 
     * Crypto Provider cannot cancel order initiated by receiver. But he can dispute it.
     */
    function cancelOrder(uint256 _orderId) 
            public isOrder(_orderId) isOrderReceiver(_orderId, _msgSender()) canBeCancelled(_orderId) {
        
    }

    /**
     * @dev When order is in progress, it can only be disputed by the provider.
     * The receiver can dispute an order only if it was marked as disputed by the provider. 
     * The Dispute can go back and forth between provider and receiver until one of these cases happen: 
     *          -The receiver or provider marks the order as DisputedWithMod
     *          -After provider has marked order as disputed, receiver acknowledges the error and calls resolveAndComplete()
     *          -After receiver has marked order as disputed, provider acknowledges the error and calls resolveAndComplete()
     */
    function disputeOrder(uint256 _orderId, uint _amountPaid, address _cryptoToSend, uint _cryptoAmountToSend) 
            public isOrder(_orderId) canBeDisputed(_orderId, _msgSender()) {
        
    }

    /**
     * @dev An order can be disputed with mod if the parties (provider and receiver) cannot resolve the issue that was raised with disputeOrder().
     * DisputedWithMod status can only be set from Disputed status. 
     * A select number of people(moderators) will have access to the DisputedWithMod orders list to solve the issue between the parties.
     */
    function disputeWithMod(uint256 _orderId, uint _amountPaid, address _cryptoToSend, uint _cryptoAmountToSend) 
            public isOrder(_orderId) isOrderProviderOrReceiver(_orderId, _msgSender()) canBeDisputedWithMod(_orderId) {
        
    }

    /**
     * @dev An order can only be resolved when it's disputed.
     * If Order.status is DisputedByReceiver, only the provider can resolveAndComplete
     * If Order.status is DisputedByProvider, only the receiver can resolveAndComplete
     * This means as soon as one party accepts the new terms of the dispute, the order is resolved and completed straightaway.
     */
    function ResolveAndComplete(uint256 _orderId) 
            public isOrder(_orderId) isOrderProviderOrReceiver(_orderId, _msgSender()) canBeResolved(_orderId, _msgSender()) {
        
    }

    /**
     * @dev Moderator assigns order to himself
     */
    function assignToModerator(uint256 _orderId) 
            public isOrder(_orderId) isModerator(_msgSender()) canBeAssigned(_orderId) {
        
    }

    /**
     * @dev After reaching out to both parties for proofs of payment, the moderator calls this function to complete order. 
     * @param _orderId the order id
     * @param _liableParty the party which is at fault, either receiver or provider, will get charged 10% as disputeWithMod fee
     * @param _amountPaid the fiat amount paid
     * @param _cryptoAmountToSend the crypto amount
     */
    function resolveWithModAndComplete(uint256 _orderId, address _liableParty, uint _amountPaid, uint _cryptoAmountToSend) 
            public isOrder(_orderId) isOrderModerator(_orderId, _msgSender()) canBeResolvedWithMod(_orderId, _msgSender()) {
        
    }


//*************************************************//
//                  Moderator logic               //

    struct Moderator {
        address myAddress;
        uint resolvedOrdersCount;
    }

    mapping (address => Moderator) private moderators;

    function addModerator(address _moderator) public onlyOwner {
        require(!moderatorExists(_moderator));
        moderators[_moderator] = Moderator(_moderator, 0);
    }

    function removeModerator(address _moderator) public onlyOwner isModerator(_moderator) {
        delete moderators[_moderator];
    }

    function getResolvedOrdersCountFor(address _moderator) public view isModerator(_moderator) returns(uint) {
        return moderators[_moderator].resolvedOrdersCount;
    }

}