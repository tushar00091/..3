// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.0;
// import "remix_tests.sol"; // this import is automatically injected by Remix.
// import "hardhat/console.sol";
import "../contracts/P2pEx.sol";

contract DripP2PTest {
    P2pEx p2Pex;
    IERC20 erc20;

    function beforeEach() public {
        p2Pex = new P2pEx();
        p2Pex.addProvider();
    }

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////PROVIDER PROPERTIES AND CRUD FUNCTIONS///////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    uint8 private maxPaymtMethods = 32;
    uint8 private maxTimeLimit = 4;

    function getAllProvidersTest() public {
        assert.equal(p2Pex.getAllProviders().length, 1, "Total provider should be 2");
    }

    function getAvailableProvidersTest() public {
        assert.equal(p2Pex.getAvailableProviders().length, 0, "Providers available should be 0");
    }

    function getUnavailableProvidersTest() public {
        assert.equal(p2Pex.getUnavailableProviders().length, 1, "Providers available should be 2");
    }

    function onlyAddUniqueProvidersTest() public {
        assert.equal(p2Pex.getAllProviders().length, 1, "Providers available should be 1");
    }

    function updateProviderTest() public {
        assert.equal(p2Pex.getAllProviders()[0].isAvailable, false, "Provider should be unavailable");
        p2Pex.updateProvider(true, maxTimeLimit, new string[](maxPaymtMethods));
        assert.equal(p2Pex.getAllProviders()[0].isAvailable, true, "Providers should be available");
    }

    function deleteProviderTest() public {
        assert.equal(p2Pex.getAllProviders().length, 1, "Provider should be unavailable");
        p2Pex.deleteProvider();
        assert.equal(p2Pex.getAllProviders().length, 0, "Providers should be available");
    }

    function registeredProvidersCountAlwaysUpToDateTest() public {
        assert.equal(p2Pex.getProvidersCount(), 1, "Should be 1");
        p2Pex.deleteProvider();
        assert.equal(p2Pex.getProvidersCount(), 0, "Should be 0");
    }

    function ProvidersAddrsArrayNotUpToDateTest() public {
        assert.equal(p2Pex.getProvidersAddrs().length, 1, "Should be 1");
        p2Pex.deleteProvider();
        assert.equal(p2Pex.getProvidersAddrs().length, 1, "Should be 1");
    }

    function ProvidersAddrsArrayUpToDateTest() public {
        assert.equal(p2Pex.getProvidersAddrs().length, 1, "Should be 1");
        p2Pex.deleteProvider();
        p2Pex.updateProvidersAddrs();
        assert.equal(p2Pex.getProvidersAddrs().length, 0, "Should be 0");
    }

    function autoCompleteCountdownMustBeLessThan4HTest() public {
        assert.equal(p2Pex.getProvider(msg.sender).autoCompleteTimeLimit <= 4, true, "Should be equal to 4 hours");
        //Do a try catch to check error handling
        //try dripP2P.updateProvider(true, 5) {
        //} catch Error(string memory rslt) {}
    }
    
    function getProviderPaymentMethodsTest() public {
        //assert.equal(dripP2P.getPaymentMethods(msg.sender) == typedef , true, "");
    }

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////BECOME A PROVIDER REQUIREMENTS FUNCTIONS/////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
   
}