// Hardhat tests are normally written with Mocha and Chai.

// We import Chai to use its asserting functions here.
const { expect } = require("chai");

// We use `loadFixture` to share common setups (or fixtures) between tests.
// Using this simplifies your tests and makes them run faster, by taking
// advantage of Hardhat Network's snapshot functionality.
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { ethers } = require("hardhat");

// String errors returned by contract functions
  const PROVIDER_ERROR = "provider error";
  const PYMT_MTHD_ERROR = "payment method error";
  const MAX_REACHED = "Max allowed reached";
  const LTE_TO_4HOURS = "Must be 4 hours or less";
  const TRANSFER_FAILED = "Transfer failed";
  const TOO_MANY = "Too many";
  const BALANCE_ERROR = "balance error";
  const ZERO_DEPOSITS_ERROR = "0 deposits error";
  const HAS_DEPOSITS_ERROR = "has deposits error";
  const TOKEN_ERROR = "Token error";
  const ONLY_OWNER_ERROR = "Ownable: caller is not the owner";

// properties names for provider
const myAddress = "myAddress";
const isAvailable = "isAvailable";
const autoCompleteTimeLimit = "autoCompleteTimeLimit";
const paymtMthds = "paymtMthds";
const currTradedTokens = "currTradedTokens";

// Constants in P2pEx
const MAX_PAYMT_MTHDS = 32;
const MOCK_TOKEN_ADDR = 0xb8c77482e45f1f44de1745f52c74426c631bdd52;

// `describe` is a Mocha function that allows you to organize your tests.
// Having your tests organized makes debugging them easier. All Mocha
// functions are available in the global scope.
describe("P2pEx contract", function () {
  // We define a fixture to reuse the same setup in every test. We use
  // loadFixture to run this setup once, snapshot that state, and reset Hardhat
  // Network to that snapshot in every test.
  async function deployP2pExFixture() {
    // Get the ContractFactory and Signers here.
    const P2pEx = await ethers.getContractFactory("P2pEx");
    const [p2pExOwner, tstOwner, addr1, addr2, mockTkn1, mockTkn2] = await ethers.getSigners();

    const p2pExContract = await P2pEx.deploy();
    await p2pExContract.deployed();

    //We deploy ERC20 test token(TST) to help with testing P2pEx
    const TestToken = await ethers.getContractFactory("TestToken", tstOwner);
    const tstTokenContract = await TestToken.deploy();
    await tstTokenContract.deployed()

    // Fixtures can return anything you consider useful for your tests
    return { p2pExContract, tstTokenContract, p2pExOwner, tstOwner, addr1, addr2, mockTkn1, mockTkn2 };
  }

  // You can nest describe calls to create subsections.
  describe("Deployment", function () {
    // `it` is another Mocha function. This is the one you use to define each
    // of your tests. It receives the test name, and a callback function.
    //
    // If the callback function is async, Mocha will `await` it.
    it("Should set the address deploying the contract as owner", async function () {
      // We use loadFixture to setup our environment, and then assert that
      // things went well
      const { p2pExContract, p2pExOwner } = await loadFixture(deployP2pExFixture);
      expect(await p2pExContract.owner()).to.equal(p2pExOwner.address);
    });

    it("Should give the address deploying Test token the full minted supply: 1000", async function () {
        const {tstTokenContract, tstOwner} = await loadFixture(deployP2pExFixture);
        console.log("Total supply: %d", await tstTokenContract.totalSupply());
        expect(await tstTokenContract.balanceOf(tstOwner.address)).to.equal(1000);
    })
  });
  
  async function seedOtherWallets(tokenContract, from, amount, to1, to2) {
    await tokenContract.connect(from).transfer(to1.address, amount);
    await tokenContract.connect(from).transfer(to2.address, amount);
  }

  async function addProviders(p2pExContract, pr1, pr2, pr3) {
    await p2pExContract.connect(pr1).addProvider();
    await p2pExContract.connect(pr2).addProvider();
    await p2pExContract.connect(pr3).addProvider();
  }

  //We make deposits in p2pEx contract
  async function approveAndDepositInP2pEx(p2pExContract, tokenContract, amount, from) {
    await tokenContract.connect(from).approve(p2pExContract.address, amount);
    await p2pExContract.connect(from).depositToTrade(tokenContract.address, amount);
  }

  //Fixture to deploy P2pEx, seed the wallets, and deposit in P2pEx contract
  async function deployAndDepositInP2pEx() {
    const { p2pExContract, tstTokenContract, p2pExOwner, tstOwner, addr1, addr2, mockTkn1, mockTkn2 } = await loadFixture(deployP2pExFixture);
    await seedOtherWallets(tstTokenContract, tstOwner, 300, p2pExOwner, addr1);
    await addProviders(p2pExContract, p2pExOwner, tstOwner, addr1);
    await p2pExContract.connect(p2pExOwner).makeTokenTradeable(tstTokenContract.address);
    await approveAndDepositInP2pEx(p2pExContract, tstTokenContract, 100, tstOwner);
    await approveAndDepositInP2pEx(p2pExContract, tstTokenContract, 200, p2pExOwner);
    await approveAndDepositInP2pEx(p2pExContract, tstTokenContract, 200, addr1);

    return { p2pExContract, tstTokenContract, p2pExOwner, tstOwner, addr1, addr2, mockTkn1, mockTkn2 };
  }

  describe("Providers CRUD functions", function () {
    describe("addProvider()", function () {
      it("Should not add existing provider", async function () {
        const { p2pExContract, tstTokenContract, p2pExOwner, tstOwner, addr1, addr2 } = await loadFixture(deployP2pExFixture);
        
        await p2pExContract.connect(tstOwner).addProvider();
        await expect(p2pExContract.connect(tstOwner).addProvider()).to.be.revertedWith(PROVIDER_ERROR);
      });

      it("Should add new provider to providers mapping and set provider.myAddress to msg.sender", async function () {
        const { p2pExContract, tstTokenContract, p2pExOwner, tstOwner, addr1, addr2 } = await loadFixture(deployP2pExFixture);
        
        await p2pExContract.connect(tstOwner).addProvider();
        expect((await p2pExContract.getProvider(tstOwner.address)).myAddress).to.equal(tstOwner.address);
      });

      it("Should always set provider.isAvailable to false", async function () {
        const { p2pExContract, tstTokenContract, p2pExOwner, tstOwner, addr1, addr2 } = await loadFixture(deployP2pExFixture);
        
        await p2pExContract.connect(tstOwner).addProvider();
        expect((await p2pExContract.getProvider(tstOwner.address)).isAvailable).to.equal(false);
      });

      it("Should always set provider.autoCompleteTimeLimit to 4 hours", async function () {
        const { p2pExContract, tstTokenContract, p2pExOwner, tstOwner, addr1, addr2 } = await loadFixture(deployP2pExFixture);
        
        await p2pExContract.connect(tstOwner).addProvider();
        expect((await p2pExContract.getProvider(tstOwner.address)).autoCompleteTimeLimit.eq(60*60*4)).to.equal(true);//4 hours in seconds
      });

      it("Should always set provider.paymtMthds to length 0", async function () {
        const { p2pExContract, tstTokenContract, p2pExOwner, tstOwner, addr1, addr2 } = await loadFixture(deployP2pExFixture);
        
        await p2pExContract.connect(tstOwner).addProvider();
        expect((await p2pExContract.getProvider(tstOwner.address)).paymtMthds).to.have.lengthOf(0);
      });

      it("Should always set provider.currTradedTokens to length 0", async function () {
        const { p2pExContract, tstTokenContract, p2pExOwner, tstOwner, addr1, addr2 } = await loadFixture(deployP2pExFixture);
        
        await p2pExContract.connect(tstOwner).addProvider();
        expect((await p2pExContract.getProvider(tstOwner.address)).currTradedTokens).to.have.lengthOf(0);
      });

      it("Should increase registeredProvidersCount", async function () {
        const { p2pExContract, tstTokenContract, p2pExOwner, tstOwner, addr1, addr2 } = await loadFixture(deployP2pExFixture);
        
        const count = await p2pExContract.getProvidersCount();
        await p2pExContract.connect(tstOwner).addProvider();
        expect(await p2pExContract.getProvidersCount()).to.equal(count + 1);
      });
    });

    describe("deleteProvider()", function () {
      it("Should revert if provider matching msg.sender is not found", async function () {
        const { p2pExContract, tstTokenContract, p2pExOwner, tstOwner, addr1, addr2 } = await loadFixture(deployP2pExFixture);
        
        await expect(p2pExContract.connect(tstOwner).deleteProvider()).to.be.revertedWith(PROVIDER_ERROR);
      });

      it("Should revert if provider still has a balance in contract.", async function () {
        const { p2pExContract, tstTokenContract, p2pExOwner, tstOwner, addr1, addr2 } = await loadFixture(deployP2pExFixture);
        
        await p2pExContract.connect(tstOwner).addProvider();
        await p2pExContract.connect(p2pExOwner).makeTokenTradeable(tstTokenContract.address);
        await approveAndDepositInP2pEx(p2pExContract, tstTokenContract, 155, tstOwner);
        await expect(p2pExContract.connect(tstOwner).deleteProvider()).to.be.revertedWith(HAS_DEPOSITS_ERROR);
      });

      it("Should delete provider that matches msg.sender from providers mapping", async function () {
        const { p2pExContract, tstTokenContract, p2pExOwner, tstOwner, addr1, addr2 } = await loadFixture(deployP2pExFixture);
        
        await p2pExContract.connect(tstOwner).addProvider();
        await p2pExContract.connect(tstOwner).deleteProvider();
        await expect(p2pExContract.connect(tstOwner).getProvider(tstOwner.address)).to.be.revertedWith(PROVIDER_ERROR);
      });

      it("Should decrease registeredProvidersCount", async function () {
        const { p2pExContract, tstTokenContract, p2pExOwner, tstOwner, addr1, addr2 } = await loadFixture(deployP2pExFixture);
        
        await p2pExContract.connect(tstOwner).addProvider();
        await p2pExContract.connect(addr1).addProvider();
        const count = await p2pExContract.getProvidersCount();

        await p2pExContract.connect(tstOwner).deleteProvider();
        expect(await p2pExContract.getProvidersCount()).to.equal(count - 1);
      });
    });

    describe("provider.paymtMthds CRUD", function () {
      //always length of 3: [_name, _acceptedCurrency, _transferInfo]
      const mockPymtMthd1 = ["payment method", "currency accepted", "transfer details"];
      const mockPymtMthd2 = ["Google pay", "USD", "send to this address: test@gmail.com"];

      describe("getPymtMthds(address _provider)", function () {
        it("Should revert if provider is not found", async function () {
          const { p2pExContract, tstTokenContract, p2pExOwner, tstOwner, addr1, addr2 } = await loadFixture(deployP2pExFixture);
          
          await expect(p2pExContract.connect(tstOwner).getPymtMthds(tstOwner.address)).to.be.revertedWith(PROVIDER_ERROR);
        });
      });

      describe("addPaymtMthd(string[] memory _newpymtMthd)", function () {

        it("_newpymtMthd[1] which is the accepted currencies should only contain words consisting of 3 uppercase letters."), async function () {
          //To be implemented on the frontend

          // acceptedCurrencies = mockPymtMthd1[1];
          // expect(acceptedCurrencies).to.not.match(/^(?:\b[A-Z]{3}\b\s*)+$/);
          // acceptedCurrencies = mockPymtMthd2[1];
          // expect(acceptedCurrencies).to.match(/^(?:\b[A-Z]{3}\b\s*)+$/);
          
        };

        it("Should revert if provider matching msg.sender is not found", async function () {
          const { p2pExContract, tstTokenContract, p2pExOwner, tstOwner, addr1, addr2 } = await loadFixture(deployP2pExFixture);
          
          await expect(p2pExContract.connect(tstOwner).addPaymtMthd(mockPymtMthd1)).to.be.revertedWith(PROVIDER_ERROR);
        });

        it("Should increase paymtMethods length.", async function () {
          const { p2pExContract, tstTokenContract, p2pExOwner, tstOwner, addr1, addr2 } = await loadFixture(deployP2pExFixture);
          
          await p2pExContract.connect(tstOwner).addProvider();
          const count = (await p2pExContract.getPymtMthds(tstOwner.address)).length;

          await p2pExContract.connect(tstOwner).addPaymtMthd(mockPymtMthd1);
          await p2pExContract.connect(tstOwner).addPaymtMthd(mockPymtMthd1);
          expect((await p2pExContract.getPymtMthds(tstOwner.address))).to.have.lengthOf(count + 2);
        });

        it("mockPymtMthd1 should match provider's added pymtMthd.", async function () {
          const { p2pExContract, tstTokenContract, p2pExOwner, tstOwner, addr1, addr2 } = await loadFixture(deployP2pExFixture);
          
          await p2pExContract.connect(tstOwner).addProvider();
          await p2pExContract.connect(tstOwner).addPaymtMthd(mockPymtMthd1);
          expect((await p2pExContract.getPymtMthds(tstOwner.address))[0][0]).to.equal(mockPymtMthd1[0]);
          expect((await p2pExContract.getPymtMthds(tstOwner.address))[0][1]).to.equal(mockPymtMthd1[1]);
          expect((await p2pExContract.getPymtMthds(tstOwner.address))[0][2]).to.equal(mockPymtMthd1[2]);
        });

        it("Should revert if max number of payment methods allowed reached", async function () {
          const { p2pExContract, tstTokenContract, p2pExOwner, tstOwner, addr1, addr2 } = await loadFixture(deployP2pExFixture);
          
          await p2pExContract.connect(tstOwner).addProvider();

          for (let i = 0; i < MAX_PAYMT_MTHDS; i++) {
            await p2pExContract.connect(tstOwner).addPaymtMthd(mockPymtMthd1);
          }

          await expect(p2pExContract.connect(tstOwner).addPaymtMthd(mockPymtMthd1)).to.be.revertedWith(MAX_REACHED);
        });
      });

      describe("removePaymtMthd(_mthdIndex)", function () {

        it("Should revert if provider matching msg.sender is not found", async function () {
          const { p2pExContract, tstTokenContract, p2pExOwner, tstOwner, addr1, addr2 } = await loadFixture(deployP2pExFixture);
          
          await expect(p2pExContract.connect(tstOwner).removePaymtMthd(1)).to.be.revertedWith(PROVIDER_ERROR);
        });

        it("Should revert if _mthdIndex >= paymtMethds.length", async function () {
          const { p2pExContract, tstTokenContract, p2pExOwner, tstOwner, addr1, addr2 } = await loadFixture(deployP2pExFixture);
          
          await p2pExContract.connect(tstOwner).addProvider();
          await p2pExContract.connect(tstOwner).addPaymtMthd(mockPymtMthd1);
          const count = (await p2pExContract.getPymtMthds(tstOwner.address)).length;

          await expect(p2pExContract.connect(tstOwner).removePaymtMthd(count)).to.be.revertedWith(PYMT_MTHD_ERROR);
        });

        it("Should remove the payment method", async function () {
          const { p2pExContract, tstTokenContract, p2pExOwner, tstOwner, addr1, addr2 } = await loadFixture(deployP2pExFixture);
          
          await p2pExContract.connect(tstOwner).addProvider();
          await p2pExContract.connect(tstOwner).addPaymtMthd(mockPymtMthd1);

          const count = (await p2pExContract.getPymtMthds(tstOwner.address)).length;
          await p2pExContract.connect(tstOwner).removePaymtMthd(count - 1);

          await expect(p2pExContract.connect(tstOwner).removePaymtMthd(count - 1)).to.be.revertedWith(PYMT_MTHD_ERROR);
        });

        it("Should reduce paymtMethds.length by 1", async function () {
          const { p2pExContract, tstTokenContract, p2pExOwner, tstOwner, addr1, addr2 } = await loadFixture(deployP2pExFixture);
          
          await p2pExContract.connect(tstOwner).addProvider();
          await p2pExContract.connect(tstOwner).addPaymtMthd(mockPymtMthd1);

          const count = (await p2pExContract.getPymtMthds(tstOwner.address)).length;
          await p2pExContract.connect(tstOwner).removePaymtMthd(count - 1);

          expect((await p2pExContract.getPymtMthds(tstOwner.address))).to.have.lengthOf(count - 1);
        });
        
      });

      describe("updatePaymtMthd(_mthdIndex, string[][] _newPymtMthd)", function () {

        it("Should revert if provider matching msg.sender is not found", async function () {
          const { p2pExContract, tstTokenContract, p2pExOwner, tstOwner, addr1, addr2 } = await loadFixture(deployP2pExFixture);
          
          await expect(p2pExContract.connect(tstOwner).updatePaymtMthd(0, mockPymtMthd1)).to.be.revertedWith(PROVIDER_ERROR);
        });

        it("Should revert if _mthdIndex >= paymtMethds.length", async function () {
          const { p2pExContract, tstTokenContract, p2pExOwner, tstOwner, addr1, addr2 } = await loadFixture(deployP2pExFixture);
          
          await p2pExContract.connect(tstOwner).addProvider();
          await p2pExContract.connect(tstOwner).addPaymtMthd(mockPymtMthd1);
          await expect(p2pExContract.connect(tstOwner).updatePaymtMthd(1, mockPymtMthd2)).to.be.revertedWith(PYMT_MTHD_ERROR);
        });

        it("Should update the payment method.", async function () {
          const { p2pExContract, tstTokenContract, p2pExOwner, tstOwner, addr1, addr2 } = await loadFixture(deployP2pExFixture);
          
          await p2pExContract.connect(tstOwner).addProvider();
          await p2pExContract.connect(tstOwner).addPaymtMthd(mockPymtMthd1);
          await p2pExContract.connect(tstOwner).updatePaymtMthd(0, mockPymtMthd2);
          expect((await p2pExContract.getPymtMthds(tstOwner.address))[0][0]).to.equal(mockPymtMthd2[0]);
          expect((await p2pExContract.getPymtMthds(tstOwner.address))[0][1]).to.equal(mockPymtMthd2[1]);
          expect((await p2pExContract.getPymtMthds(tstOwner.address))[0][2]).to.equal(mockPymtMthd2[2]);
        });

        it("Should not change paymtMethds.length", async function () {
          const { p2pExContract, tstTokenContract, p2pExOwner, tstOwner, addr1, addr2 } = await loadFixture(deployP2pExFixture);
          
          await p2pExContract.connect(tstOwner).addProvider();
          await p2pExContract.connect(tstOwner).addPaymtMthd(mockPymtMthd1);
          await p2pExContract.connect(tstOwner).updatePaymtMthd(0, mockPymtMthd2);
          expect((await p2pExContract.getPymtMthds(tstOwner.address))).to.have.lengthOf(1);
        });
      });

      describe("updateAllPaymtMthds(string[][] _newPymtMthds)", function () {

        it("Should revert if provider matching msg.sender is not found", async function () {
          const { p2pExContract, tstTokenContract, p2pExOwner, tstOwner, addr1, addr2 } = await loadFixture(deployP2pExFixture);
          
          await expect(p2pExContract.connect(tstOwner).updateAllPaymtMthds([mockPymtMthd1, mockPymtMthd2])).to.be.revertedWith(PROVIDER_ERROR);
        });

        it("Should revert if _newPymtMthds.length >= paymtMethds.length", async function () {
          const { p2pExContract, tstTokenContract, p2pExOwner, tstOwner, addr1, addr2 } = await loadFixture(deployP2pExFixture);
          
          await p2pExContract.connect(tstOwner).addProvider();
          await p2pExContract.connect(tstOwner).addPaymtMthd(mockPymtMthd1);
          let newPymtMthds = [mockPymtMthd2, mockPymtMthd1, mockPymtMthd1];
          await expect(p2pExContract.connect(tstOwner).updateAllPaymtMthds(newPymtMthds)).to.be.revertedWith(PYMT_MTHD_ERROR);
        });

        it("Should update all the payment methods.", async function () {
          const { p2pExContract, tstTokenContract, p2pExOwner, tstOwner, addr1, addr2 } = await loadFixture(deployP2pExFixture);
          
          await p2pExContract.connect(tstOwner).addProvider();
          await p2pExContract.connect(tstOwner).addPaymtMthd(mockPymtMthd1);
          await p2pExContract.connect(tstOwner).addPaymtMthd(mockPymtMthd2);
          let newPymtMthds = [mockPymtMthd2, mockPymtMthd1];
          await p2pExContract.connect(tstOwner).updateAllPaymtMthds(newPymtMthds);

          expect((await p2pExContract.getPymtMthds(tstOwner.address))[0][0]).to.equal(mockPymtMthd2[0]);
          expect((await p2pExContract.getPymtMthds(tstOwner.address))[0][1]).to.equal(mockPymtMthd2[1]);
          expect((await p2pExContract.getPymtMthds(tstOwner.address))[0][2]).to.equal(mockPymtMthd2[2]);

          expect((await p2pExContract.getPymtMthds(tstOwner.address))[1][0]).to.equal(mockPymtMthd1[0]);
          expect((await p2pExContract.getPymtMthds(tstOwner.address))[1][1]).to.equal(mockPymtMthd1[1]);
          expect((await p2pExContract.getPymtMthds(tstOwner.address))[1][2]).to.equal(mockPymtMthd1[2]);
        });

        it("Should not change paymtMethds.length", async function () {
          const { p2pExContract, tstTokenContract, p2pExOwner, tstOwner, addr1, addr2 } = await loadFixture(deployP2pExFixture);
          
          await p2pExContract.connect(tstOwner).addProvider();
          await p2pExContract.connect(tstOwner).addPaymtMthd(mockPymtMthd1);
          await p2pExContract.connect(tstOwner).addPaymtMthd(mockPymtMthd2);
          let newPymtMthds = [mockPymtMthd2, mockPymtMthd1];
          await p2pExContract.connect(tstOwner).updateAllPaymtMthds(newPymtMthds);

          expect((await p2pExContract.getPymtMthds(tstOwner.address))).to.have.lengthOf(2);
        });
        
      });
    });

    describe("<provider.isAvailable CRUD", function () {
      describe("becomeAvailable()", function () {
        it("Should revert if provider matching msg.sender is not found", async function () {
          const { p2pExContract, tstTokenContract, p2pExOwner, tstOwner, addr1, addr2 } = await loadFixture(deployP2pExFixture);
          await expect(p2pExContract.connect(addr2).becomeAvailable()).to.be.revertedWith(PROVIDER_ERROR);
        });

        it("Should revert if provider has no deposits in <mapping tradeableAmountByTokenByProvider>", async function () {
          const { p2pExContract, tstTokenContract, p2pExOwner, tstOwner, addr1, addr2 } = await loadFixture(deployP2pExFixture);

          await p2pExContract.connect(tstOwner).addProvider();
          await expect(p2pExContract.connect(tstOwner).becomeAvailable()).to.be.revertedWith(ZERO_DEPOSITS_ERROR);
        });

        it("Should become available if provider has at least one deposit in <mapping tradeableAmountByTokenByProvider>", async function () {
          const { p2pExContract, tstTokenContract, p2pExOwner, tstOwner, addr1, addr2 } = await loadFixture(deployP2pExFixture);

          await p2pExContract.connect(tstOwner).addProvider();
          await p2pExContract.connect(p2pExOwner).makeTokenTradeable(tstTokenContract.address);
          await approveAndDepositInP2pEx(p2pExContract, tstTokenContract, 300, tstOwner);
          await p2pExContract.connect(tstOwner).becomeAvailable();

          expect(await p2pExContract.getAvailability(tstOwner.address)).to.equal(true);
        });
      });

      describe("becomeUnavailable()", function () {
        it("Should revert if provider matching msg.sender is not found", async function () {
          const { p2pExContract, tstTokenContract, p2pExOwner, tstOwner, addr1, addr2 } = await loadFixture(deployP2pExFixture);
          await expect(p2pExContract.connect(addr2).becomeUnavailable()).to.be.revertedWith(PROVIDER_ERROR);
        });

        it("Should become unavailable if provider matching msg.sender is found", async function () {
          const { p2pExContract, tstTokenContract, p2pExOwner, tstOwner, addr1, addr2 } = await loadFixture(deployP2pExFixture);

          await p2pExContract.connect(tstOwner).addProvider();
          await p2pExContract.connect(tstOwner).becomeUnavailable();

          expect(await p2pExContract.getAvailability(tstOwner.address)).to.equal(false);
        });
      });

      describe("getUnavailableProviders()", function () {
        it("Should only return unavailable providers", async function() {
          // creates three providers: p2pExOwner, tstOwner, addr1
          const { p2pExContract, tstTokenContract, p2pExOwner, tstOwner, addr1, addr2 } = await loadFixture(deployAndDepositInP2pEx);
  
          await p2pExContract.connect(tstOwner).becomeAvailable();
          const unavailablelst = await p2pExContract.getUnavailableProviders();

          expect(unavailablelst).to.have.lengthOf(2);
          unavailablelst.forEach(provider => {
            expect(provider.isAvailable).to.equal(false);
          });
        });
      });

      describe("getAvailableProviders()", function () {
        it("Should only return available providers", async function() {
          // creates three providers: p2pExOwner, tstOwner, addr1
          const { p2pExContract, tstTokenContract, p2pExOwner, tstOwner, addr1, addr2 } = await loadFixture(deployAndDepositInP2pEx);
  
          await p2pExContract.connect(tstOwner).becomeAvailable();
          await p2pExContract.connect(p2pExOwner).becomeAvailable();
          const availablelst = await p2pExContract.getAvailableProviders();

          expect(availablelst).to.have.lengthOf(2);
          availablelst.forEach(provider => {
            expect(provider.isAvailable).to.equal(true);
          });
        });
      });
    });

    describe("provider.currTradedTokens CRUD", function () {
      describe("addToCurrTradedTokens(_newToken)", function () {
        it("Should revert if provider matching msg.sender is not found", async function () {
          const { p2pExContract, tstTokenContract, p2pExOwner, tstOwner, addr1, mockTkn1, mockTkn2 } = await loadFixture(deployP2pExFixture);
          
          await expect(p2pExContract.connect(addr1).addToCurrTradedTokens(tstTokenContract.address)).to.be.revertedWith(PROVIDER_ERROR);
        });

        it("Should revert if token is not tradeable", async function () {
          const { p2pExContract, tstTokenContract, p2pExOwner, tstOwner, addr1, mockTkn1, mockTkn2 } = await loadFixture(deployP2pExFixture);
          await p2pExContract.connect(tstOwner).addProvider();
          
          await expect(p2pExContract.connect(tstOwner).addToCurrTradedTokens(tstTokenContract.address)).to.be.revertedWith(TOKEN_ERROR);
        });
  
        it("Should not add _token again of already currently traded", async function () {
          const { p2pExContract, tstTokenContract, p2pExOwner, tstOwner, addr1, mockTkn1, mockTkn2 } = await loadFixture(deployP2pExFixture);
          await p2pExContract.connect(tstOwner).addProvider();

          await p2pExContract.connect(p2pExOwner).makeTokenTradeable(tstTokenContract.address);
          await p2pExContract.connect(p2pExOwner).makeTokenTradeable(mockTkn1.address);
          
          await p2pExContract.connect(tstOwner).addToCurrTradedTokens(tstTokenContract.address);
          await p2pExContract.connect(tstOwner).addToCurrTradedTokens(mockTkn1.address);
          let lstLength = (await p2pExContract.getCurrTradedTokens(tstOwner.address)).length;

          await p2pExContract.connect(tstOwner).addToCurrTradedTokens(mockTkn1.address);
          expect((await p2pExContract.getCurrTradedTokens(tstOwner.address)).length).to.be.equal(lstLength);
        });
  
        it("Should add token to currTradedTokens and idxOfCurrTradedTokensByProvider mapping", async function () {
          const { p2pExContract, tstTokenContract, p2pExOwner, tstOwner, addr1, addr2, mockTkn1, mockTkn2 } = await loadFixture(deployP2pExFixture);
          await p2pExContract.connect(tstOwner).addProvider();

          await p2pExContract.connect(p2pExOwner).makeTokenTradeable(tstTokenContract.address);
          await p2pExContract.connect(p2pExOwner).makeTokenTradeable(mockTkn1.address);
          
          await p2pExContract.connect(tstOwner).addToCurrTradedTokens(mockTkn1.address);
          await p2pExContract.connect(tstOwner).addToCurrTradedTokens(tstTokenContract.address);
  
          let mockTkn1Idx = await p2pExContract.getCurrTradedTokenIndex(mockTkn1.address, tstOwner.address);
          expect((await p2pExContract.getCurrTradedTokens(tstOwner.address))[mockTkn1Idx]).to.be.equal(mockTkn1.address);
        });
      });
  
      describe("getCurrTradedTokenIndex(_token, _provider)", function () {
        it("Should revert if _provider address is not a provider", async function () {
          const { p2pExContract, tstTokenContract, p2pExOwner, tstOwner, addr1 } = await loadFixture(deployP2pExFixture);
          
          await expect(p2pExContract.getCurrTradedTokenIndex(tstTokenContract.address, tstOwner.address)).to.be.revertedWith(PROVIDER_ERROR);
        });

        it("Should revert if _token is not currently traded by _provider", async function () {
          const { p2pExContract, tstTokenContract, p2pExOwner, tstOwner, addr1 } = await loadFixture(deployP2pExFixture);
          await p2pExContract.connect(tstOwner).addProvider();
          
          await expect(p2pExContract.getCurrTradedTokenIndex(tstTokenContract.address, tstOwner.address)).to.be.revertedWith(TOKEN_ERROR);
        });
  
        it("Should return the index matching currTradedTokens", async function () {
          const { p2pExContract, tstTokenContract, p2pExOwner, tstOwner, addr1, addr2, mockTkn1, mockTkn2 } = await loadFixture(deployP2pExFixture);
          await p2pExContract.connect(tstOwner).addProvider();

          await p2pExContract.connect(p2pExOwner).makeTokenTradeable(tstTokenContract.address);
          await p2pExContract.connect(p2pExOwner).makeTokenTradeable(mockTkn1.address);
          await p2pExContract.connect(p2pExOwner).makeTokenTradeable(mockTkn2.address);
          
          await p2pExContract.connect(tstOwner).addToCurrTradedTokens(tstTokenContract.address);
          await p2pExContract.connect(tstOwner).addToCurrTradedTokens(mockTkn1.address);
          await p2pExContract.connect(tstOwner).addToCurrTradedTokens(mockTkn2.address);
  
          let tstIdx = await p2pExContract.getCurrTradedTokenIndex(tstTokenContract.address, tstOwner.address);
          let mockTkn1Idx = await p2pExContract.getCurrTradedTokenIndex(mockTkn1.address, tstOwner.address);
          let mockTkn2Idx = await p2pExContract.getCurrTradedTokenIndex(mockTkn2.address, tstOwner.address);
  
          expect((await p2pExContract.getCurrTradedTokens(tstOwner.address))[tstIdx]).to.be.equal(tstTokenContract.address);
          expect((await p2pExContract.getCurrTradedTokens(tstOwner.address))[mockTkn1Idx]).to.be.equal(mockTkn1.address);
          expect((await p2pExContract.getCurrTradedTokens(tstOwner.address))[mockTkn2Idx]).to.be.equal(mockTkn2.address);
        });
      });

      describe("removeFromCurrTradedTokens(_token)", function () {
        it("Should revert if provider matching msg.sender is not found", async function () {
          const { p2pExContract, tstTokenContract, p2pExOwner, tstOwner, addr1, mockTkn1, mockTkn2 } = await loadFixture(deployP2pExFixture);
          
          await expect(p2pExContract.connect(addr1).removeFromCurrTradedTokens(tstTokenContract.address)).to.be.revertedWith(PROVIDER_ERROR);
        });
  
        it("Should revert if _token is not currently traded", async function () {
          const { p2pExContract, tstTokenContract, p2pExOwner, tstOwner, addr1, mockTkn1, mockTkn2 } = await loadFixture(deployP2pExFixture);
          await p2pExContract.connect(tstOwner).addProvider();

          await expect(p2pExContract.connect(tstOwner).removeFromCurrTradedTokens(tstTokenContract.address)).to.be.revertedWith(TOKEN_ERROR);
        });
  
        it("Should remove token from currTradedTokens and idxOfCurrTradedTokensByProvider mapping", async function () {
          const { p2pExContract, tstTokenContract, p2pExOwner, tstOwner, addr1, addr2, mockTkn1, mockTkn2 } = await loadFixture(deployP2pExFixture);
          await p2pExContract.connect(tstOwner).addProvider();

          await p2pExContract.connect(p2pExOwner).makeTokenTradeable(tstTokenContract.address);
          await p2pExContract.connect(p2pExOwner).makeTokenTradeable(mockTkn1.address);
          
          await p2pExContract.connect(tstOwner).addToCurrTradedTokens(mockTkn1.address);
          await p2pExContract.connect(tstOwner).addToCurrTradedTokens(tstTokenContract.address);
  
          let mockTkn1Idx = await p2pExContract.getCurrTradedTokenIndex(mockTkn1.address, tstOwner.address);
          await p2pExContract.connect(tstOwner).removeFromCurrTradedTokens(mockTkn1.address);

          await expect(p2pExContract.getCurrTradedTokenIndex(mockTkn1.address, tstOwner.address)).to.be.revertedWith(TOKEN_ERROR);
          expect((await p2pExContract.getCurrTradedTokens(tstOwner.address))[mockTkn1Idx]).to.not.be.equal(mockTkn1.address);
        });
      });
    });
  });

  describe("Contract's tradeable tokens", function () {
    describe("makeTokenTradeable(_newToken)", function () {
      it("Should revert if called by address other than owner", async function () {
        const { p2pExContract, tstTokenContract, p2pExOwner, tstOwner, addr1 } = await loadFixture(deployP2pExFixture);
        
        await expect(p2pExContract.connect(tstOwner).makeTokenTradeable(tstTokenContract.address)).to.be.revertedWith(ONLY_OWNER_ERROR);
      });

      it("Should revert if token is already tradeable", async function () {
        const { p2pExContract, tstTokenContract, p2pExOwner, tstOwner, addr1 } = await loadFixture(deployP2pExFixture);
        
        await p2pExContract.connect(p2pExOwner).makeTokenTradeable(tstTokenContract.address);
        await expect(p2pExContract.connect(p2pExOwner).makeTokenTradeable(tstTokenContract.address)).to.be.revertedWith(TOKEN_ERROR);
      });

      it("Should add token to tradeableTokensLst and tradeableTokens mapping", async function () {
        const { p2pExContract, tstTokenContract, p2pExOwner, tstOwner, addr1, addr2, mockTkn1, mockTkn2 } = await loadFixture(deployP2pExFixture);
        
        await p2pExContract.connect(p2pExOwner).makeTokenTradeable(mockTkn1.address);
        await p2pExContract.connect(p2pExOwner).makeTokenTradeable(tstTokenContract.address);

        let tstIdx = await p2pExContract.getTradeableTokenIndex(tstTokenContract.address);
        expect((await p2pExContract.getTradeableTokensLst())[tstIdx]).to.be.equal(tstTokenContract.address);
      });
    });

    describe("getTradeableTokenIndex(_token)", function () {
      it("Should revert if token is not tradeable", async function () {
        const { p2pExContract, tstTokenContract, p2pExOwner, tstOwner, addr1 } = await loadFixture(deployP2pExFixture);
        
        await expect(p2pExContract.getTradeableTokenIndex(tstTokenContract.address)).to.be.revertedWith(TOKEN_ERROR);
      });

      it("Should return the index matchin tradeableTokensLst", async function () {
        const { p2pExContract, tstTokenContract, p2pExOwner, tstOwner, addr1, addr2, mockTkn1, mockTkn2 } = await loadFixture(deployP2pExFixture);
        
        await p2pExContract.connect(p2pExOwner).makeTokenTradeable(tstTokenContract.address);
        await p2pExContract.connect(p2pExOwner).makeTokenTradeable(mockTkn1.address);
        await p2pExContract.connect(p2pExOwner).makeTokenTradeable(mockTkn2.address);

        let tstIdx = await p2pExContract.getTradeableTokenIndex(tstTokenContract.address);
        let mockTkn1Idx = await p2pExContract.getTradeableTokenIndex(mockTkn1.address);
        let mockTkn2Idx = await p2pExContract.getTradeableTokenIndex(mockTkn2.address);

        expect((await p2pExContract.getTradeableTokensLst())[tstIdx]).to.be.equal(tstTokenContract.address);
        expect((await p2pExContract.getTradeableTokensLst())[mockTkn1Idx]).to.be.equal(mockTkn1.address);
        expect((await p2pExContract.getTradeableTokensLst())[mockTkn2Idx]).to.be.equal(mockTkn2.address);
      });
    });
  });

  describe("depositToTrade(_token, _tradeAmount)", function () {
    it("Should revert if provider matching msg.sender is not found", async function () {
      const { p2pExContract, tstTokenContract, p2pExOwner, tstOwner, addr1 } = await loadFixture(deployP2pExFixture);
      await tstTokenContract.connect(tstOwner).approve(p2pExContract.address, 100);

      await expect(p2pExContract.connect(tstOwner).depositToTrade(tstTokenContract.address, 100)).to.be.revertedWith(PROVIDER_ERROR);
    });

    it("Should revert if _token is not in p2pExContract's tradeableTokens list.", async function () {
      const { p2pExContract, tstTokenContract, p2pExOwner, tstOwner, addr1 } = await loadFixture(deployP2pExFixture);
      await p2pExContract.connect(tstOwner).addProvider();
      await tstTokenContract.connect(tstOwner).approve(p2pExContract.address, 100);

      await expect(p2pExContract.connect(tstOwner).depositToTrade(tstTokenContract.address, 100)).to.be.revertedWith(TOKEN_ERROR);
    });

    it("Should increase p2pExContract balance of _token by _tradeAmount", async function () {
        const { p2pExContract, tstTokenContract, p2pExOwner, tstOwner, addr1 } = await loadFixture(deployP2pExFixture);
        
        await seedOtherWallets(tstTokenContract, tstOwner, 300, p2pExOwner, addr1);
        await addProviders(p2pExContract, tstOwner, p2pExOwner, addr1);
        await p2pExContract.connect(p2pExOwner).makeTokenTradeable(tstTokenContract.address);

        const balanceBefore = await p2pExContract.balanceOf(tstTokenContract.address);
        await approveAndDepositInP2pEx(p2pExContract, tstTokenContract, 100, tstOwner);
        expect(await p2pExContract.balanceOf(tstTokenContract.address)).to.equal(balanceBefore + 100);

        await approveAndDepositInP2pEx(p2pExContract, tstTokenContract, 150, p2pExOwner);
        expect(await p2pExContract.balanceOf(tstTokenContract.address)).to.equal(balanceBefore + 250);

        await approveAndDepositInP2pEx(p2pExContract, tstTokenContract, 200, addr1);
        expect(await p2pExContract.balanceOf(tstTokenContract.address)).to.equal(balanceBefore + 450);
    });

    it("If new token for provider, should add it to provider.currTradedTokens and idxOfCurrTradedTokensByProvider mapping.", async function () {
        const { p2pExContract, tstTokenContract, p2pExOwner, tstOwner, addr1 } = await loadFixture(deployP2pExFixture);
        await p2pExContract.connect(tstOwner).addProvider();
        await p2pExContract.connect(p2pExOwner).makeTokenTradeable(tstTokenContract.address);

        await approveAndDepositInP2pEx(p2pExContract, tstTokenContract, 100, tstOwner);
  
        let tstTknIdx = await p2pExContract.getCurrTradedTokenIndex(tstTokenContract.address, tstOwner.address);
        expect((await p2pExContract.getCurrTradedTokens(tstOwner.address))[tstTknIdx]).to.be.equal(tstTokenContract.address);
    });

    it("Should increase provider deposited amount of _token by _tradeAmount. Mapping is tradeableAmountByTokenByProvider", async function () {
        const { p2pExContract, tstTokenContract, p2pExOwner, tstOwner, addr1 } = await loadFixture(deployP2pExFixture);
        await p2pExContract.connect(tstOwner).addProvider();
        await p2pExContract.connect(p2pExOwner).makeTokenTradeable(tstTokenContract.address);
        await p2pExContract.connect(tstOwner).addToCurrTradedTokens(tstTokenContract.address);

        balanceBefore = await p2pExContract.getDepositedAmountByTokenByProvider(tstTokenContract.address, tstOwner.address);
        await approveAndDepositInP2pEx(p2pExContract, tstTokenContract, 100, tstOwner);
        
        expect(await p2pExContract.getDepositedAmountByTokenByProvider(tstTokenContract.address, tstOwner.address)).to.be.equal(balanceBefore + 100);
    });
  });

  describe("Order tests", function () {
    const pymtMthdIdx = 0;
    const amntPaid = 100;
    const currUsed = "USD";
    const amntToSend = 5;
    const mockPymtMthd1 = ["payment method", "currency accepted", "transfer details"];
    const mockPymtMthd2 = ["Google pay", "USD", "send to this address: test@gmail.com"];
    
    describe("initiateOrder(address _receiver, address _provider, uint8 _pmtMthdIdx, uint _amountPaid, address cryptoToSend, uint _cryptoAmountToSend)", function () {
      it("Should revert if _provider is not found", async function () {
        const { p2pExContract, tstTokenContract, p2pExOwner, tstOwner, addr1, mockTkn1, mockTkn2 } = await loadFixture(deployP2pExFixture);

        await expect(p2pExContract.connect(addr1)
          .initiateOrder(tstOwner.address, pymtMthdIdx, amntPaid, tstTokenContract.address, amntToSend))
          .to.be.revertedWith(PROVIDER_ERROR);
      });

      it("Should revert if provider not available", async function () {
        
      });

      it("Should revert if _pmtMthdIdx is not found", async function () {
        const { p2pExContract, tstTokenContract, p2pExOwner, tstOwner, addr1, mockTkn1, mockTkn2 } = await loadFixture(deployP2pExFixture);
        await p2pExContract.connect(tstOwner).addProvider();

        await expect(p2pExContract.connect(addr1)
          .initiateOrder(tstOwner.address, pymtMthdIdx, amntPaid, tstTokenContract.address, amntToSend))
          .to.be.revertedWith(PYMT_MTHD_ERROR);
      });

      it("Should revert if _cryptoAmountToSend higher than amount available to trade", async function () {
        const { p2pExContract, tstTokenContract, p2pExOwner, tstOwner, addr1, mockTkn1, mockTkn2 } = await loadFixture(deployP2pExFixture);
        await p2pExContract.connect(tstOwner).addProvider();

        await p2pExContract.connect(tstOwner).addPaymtMthd(mockPymtMthd2);
        await p2pExContract.connect(p2pExOwner).makeTokenTradeable(tstTokenContract.address);
        await approveAndDepositInP2pEx(p2pExContract, tstTokenContract, 3, tstOwner);

        await expect(p2pExContract.connect(addr1)
          .initiateOrder(tstOwner.address, pymtMthdIdx, amntPaid, tstTokenContract.address, amntToSend))
          .to.be.revertedWith(BALANCE_ERROR);
      });

      it("Should create a new order with status InProgress", async function () {
        
      });

      it("Should increase ordersCount by 1", async function () {
        
      });

      it("Should add order to ordersLst with index being ordersCount", async function () {
        
      });
    });

    describe("completeOrder(uint orderIndex)", function () {
      it("Should revert if order is not found", async function () {
        
      });

      it("Should revert if _msgSender() is not the order provider", async function () {
        
      });

      it("Should revert if Order.status is not Status.InProgress", async function () {
        
      });

      it("Should tranfer Order.cryptoAmountToSend to Order.receiver address", async function () {
        
      });

      it("Should decrease depositedAmountByTokenByProvider[Order.provider][Order.cryptoToSend] by Order.cryptoAmountToSend", async function () {
        
      });

      it("Should change Order.status to status.Completed", async function () {
        
      });
    });

    describe("cancelOrder(uint orderIndex)", function () {
      it("Should revert if order is not found", async function () {
        
      });

      it("Should revert if _msgSender() doesn't match Order.receiver", async function () {
        
      });

      it("Should revert if order is already cancelled", async function () {
        
      });

      it("Should revert if Order.status is Status.DisputedWithMod", async function () {
        
      });

      it("Should change Order.status to status.Cancelled", async function () {
        
      });
    });

    describe("disputeOrder(uint orderIndex)", function () {
      it("Should revert if order is not found", async function () {
        
      });

      it("Should revert if _msgSender() doesn't match Order.receiver", async function () {
        
      });

      it("Should revert if order is already cancelled", async function () {
        
      });

      it("Should revert if Order.status is Status.DisputedWithMod", async function () {
        
      });

      it("Should change Order.status to status.Cancelled", async function () {
        
      });
    });
  });

});