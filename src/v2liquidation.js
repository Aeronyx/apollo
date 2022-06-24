"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.fetchV2UnhealthyLoans = exports.profit_threshold = void 0;

var _constants = require("./constants");

var _sdk = require("@uniswap/sdk");

var _trades = require("./uniswap/trades");

var _gas = require("./utils/gas");

function asyncGeneratorStep(gen, resolve, reject, _next, _throw, key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { Promise.resolve(value).then(_next, _throw); } }

function _asyncToGenerator(fn) { return function () { var self = this, args = arguments; return new Promise(function (resolve, reject) { var gen = fn.apply(self, args); function _next(value) { asyncGeneratorStep(gen, resolve, reject, _next, _throw, "next", value); } function _throw(err) { asyncGeneratorStep(gen, resolve, reject, _next, _throw, "throw", err); } _next(undefined); }); }; }

var GAS_USED_ESTIMATE = 1000000;
var FLASH_LOAN_FEE = 0.009;
var theGraphURL_v2_kovan = 'https://api.thegraph.com/subgraphs/name/aave/protocol-v2-kovan';
var theGraphURL_v2_mainnet = 'https://api.thegraph.com/subgraphs/name/aave/protocol-v2';
var theGraphURL_v2 = _constants.APP_CHAIN_ID == _sdk.ChainId.MAINNET ? theGraphURL_v2_mainnet : theGraphURL_v2_kovan;
var allowedLiquidation = .5; //50% of a borrowed asset can be liquidated

var healthFactorMax = 1; //liquidation can happen when less than 1

var profit_threshold = .1 * Math.pow(10, 18); //in eth. A bonus below this will be ignored

exports.profit_threshold = profit_threshold;

var fetchV2UnhealthyLoans = /*#__PURE__*/function () {
  var _fetchV2UnhealthyLoans = _asyncToGenerator( /*#__PURE__*/regeneratorRuntime.mark(function _callee(user_id) {
    var count, maxCount, user_id_query;
    return regeneratorRuntime.wrap(function _callee$(_context) {
      while (1) {
        switch (_context.prev = _context.next) {
          case 0:
            count = 0;
            maxCount = 6;
            user_id_query = "";

            if (user_id) {
              user_id_query = "id: \"".concat(user_id, "\",");
              maxCount = 1;
            }

            console.log("".concat(Date().toLocaleString(), " fetching unhealthy loans}"));

            while (count < maxCount) {
              fetch(theGraphURL_v2, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  query: "\n      query GET_LOANS {\n        users(first:1000, skip:".concat(1000 * count, ", orderBy: id, orderDirection: desc, where: {").concat(user_id_query, "borrowedReservesCount_gt: 0}) {\n          id\n          borrowedReservesCount\n          collateralReserve:reserves(where: {currentATokenBalance_gt: 0}) {\n            currentATokenBalance\n            reserve{\n              usageAsCollateralEnabled\n              reserveLiquidationThreshold\n              reserveLiquidationBonus\n              borrowingEnabled\n              utilizationRate\n              symbol\n              underlyingAsset\n              price {\n                priceInEth\n              }\n              decimals\n            }\n          }\n          borrowReserve: reserves(where: {currentTotalDebt_gt: 0}) {\n            currentTotalDebt\n            reserve{\n              usageAsCollateralEnabled\n              reserveLiquidationThreshold\n              borrowingEnabled\n              utilizationRate\n              symbol\n              underlyingAsset\n              price {\n                priceInEth\n              }\n              decimals\n            }\n          }\n        }\n      }")
                })
              }).then(function (res) {
                return res.json();
              }).then(function (res) {
                var total_loans = res.data.users.length;
                var unhealthyLoans = parseUsers(res.data);
                if (unhealthyLoans.length > 0) liquidationProfits(unhealthyLoans);
                if (total_loans > 0) console.log("Records:".concat(total_loans, " Unhealthy:").concat(unhealthyLoans.length));
              });
              count++;
            }

          case 6:
          case "end":
            return _context.stop();
        }
      }
    }, _callee);
  }));

  function fetchV2UnhealthyLoans(_x) {
    return _fetchV2UnhealthyLoans.apply(this, arguments);
  }

  return fetchV2UnhealthyLoans;
}();

exports.fetchV2UnhealthyLoans = fetchV2UnhealthyLoans;

function parseUsers(payload) {
  var loans = [];
  payload.users.forEach(function (user, i) {
    var totalBorrowed = 0;
    var totalCollateral = 0;
    var totalCollateralThreshold = 0;
    var max_borrowedSymbol;
    var max_borrowedPrincipal = 0;
    var max_borrowedPriceInEth = 0;
    var max_collateralSymbol;
    var max_collateralBonus = 0;
    var max_collateralPriceInEth = 0;
    user.borrowReserve.forEach(function (borrowReserve, i) {
      var priceInEth = borrowReserve.reserve.price.priceInEth;
      var principalBorrowed = borrowReserve.currentTotalDebt;
      totalBorrowed += priceInEth * principalBorrowed / Math.pow(10, borrowReserve.reserve.decimals);
      if (principalBorrowed > max_borrowedPrincipal) max_borrowedSymbol = borrowReserve.reserve.symbol;
      max_borrowedPrincipal = principalBorrowed;
      max_borrowedPriceInEth = priceInEth;
    });
    user.collateralReserve.forEach(function (collateralReserve, i) {
      var priceInEth = collateralReserve.reserve.price.priceInEth;
      var principalATokenBalance = collateralReserve.currentATokenBalance;
      totalCollateral += priceInEth * principalATokenBalance / Math.pow(10, collateralReserve.reserve.decimals);
      totalCollateralThreshold += priceInEth * principalATokenBalance * (collateralReserve.reserve.reserveLiquidationThreshold / 10000) / Math.pow(10, collateralReserve.reserve.decimals);

      if (collateralReserve.reserve.reserveLiquidationBonus > max_collateralBonus) {
        max_collateralSymbol = collateralReserve.reserve.symbol;
        max_collateralBonus = collateralReserve.reserve.reserveLiquidationBonus;
        max_collateralPriceInEth = priceInEth;
      }
    });
    var healthFactor = totalCollateralThreshold / totalBorrowed;

    if (healthFactor <= healthFactorMax) {
      loans.push({
        "user_id": user.id,
        "healthFactor": healthFactor,
        "max_collateralSymbol": max_collateralSymbol,
        "max_borrowedSymbol": max_borrowedSymbol,
        "max_borrowedPrincipal": max_borrowedPrincipal,
        "max_borrowedPriceInEth": max_borrowedPriceInEth,
        "max_collateralBonus": max_collateralBonus / 10000,
        "max_collateralPriceInEth": max_collateralPriceInEth
      });
    }
  }); //filter out loans under a threshold that we know will not be profitable (liquidation_threshold)

  loans = loans.filter(function (loan) {
    return loan.max_borrowedPrincipal * allowedLiquidation * (loan.max_collateralBonus - 1) * loan.max_borrowedPriceInEth / Math.pow(10, _constants.TOKEN_LIST[loan.max_borrowedSymbol].decimals) >= profit_threshold;
  });
  return loans;
}

function liquidationProfits(_x2) {
  return _liquidationProfits.apply(this, arguments);
}

function _liquidationProfits() {
  _liquidationProfits = _asyncToGenerator( /*#__PURE__*/regeneratorRuntime.mark(function _callee4(loans) {
    return regeneratorRuntime.wrap(function _callee4$(_context4) {
      while (1) {
        switch (_context4.prev = _context4.next) {
          case 0:
            loans.map( /*#__PURE__*/function () {
              var _ref2 = _asyncToGenerator( /*#__PURE__*/regeneratorRuntime.mark(function _callee3(loan) {
                return regeneratorRuntime.wrap(function _callee3$(_context3) {
                  while (1) {
                    switch (_context3.prev = _context3.next) {
                      case 0:
                        liquidationProfit(loan);

                      case 1:
                      case "end":
                        return _context3.stop();
                    }
                  }
                }, _callee3);
              }));

              return function (_x5) {
                return _ref2.apply(this, arguments);
              };
            }());

          case 1:
          case "end":
            return _context4.stop();
        }
      }
    }, _callee4);
  }));
  return _liquidationProfits.apply(this, arguments);
}

function liquidationProfit(_x3) {
  return _liquidationProfit.apply(this, arguments);
} //returned value is in eth


function _liquidationProfit() {
  _liquidationProfit = _asyncToGenerator( /*#__PURE__*/regeneratorRuntime.mark(function _callee5(loan) {
    var flashLoanAmount, flashLoanCost, flashLoanAmountInEth, flashLoanAmountInEth_plusBonus, collateralTokensFromPayout, fromTokenAmount, bestTrade, minimumTokensAfterSwap, gasFee, flashLoanPlusCost, profitInBorrowCurrency, profitInEth, profitInEthAfterGas;
    return regeneratorRuntime.wrap(function _callee5$(_context5) {
      while (1) {
        switch (_context5.prev = _context5.next) {
          case 0:
            //flash loan fee
            flashLoanAmount = percentBigInt(BigInt(loan.max_borrowedPrincipal), allowedLiquidation);
            flashLoanCost = percentBigInt(flashLoanAmount, FLASH_LOAN_FEE); //minimum amount of liquidated coins that will be paid out as profit

            flashLoanAmountInEth = flashLoanAmount * BigInt(loan.max_borrowedPriceInEth) / BigInt(Math.pow(10, _constants.TOKEN_LIST[loan.max_borrowedSymbol].decimals));
            flashLoanAmountInEth_plusBonus = percentBigInt(flashLoanAmountInEth, loan.max_collateralBonus); //add the bonus

            collateralTokensFromPayout = flashLoanAmountInEth_plusBonus * BigInt(Math.pow(10, _constants.TOKEN_LIST[loan.max_collateralSymbol].decimals)) / BigInt(loan.max_collateralPriceInEth); //this is the amount of tokens that will be received as payment for liquidation and then will need to be swapped back to token of the flashloan

            fromTokenAmount = new _sdk.TokenAmount(_constants.TOKEN_LIST[loan.max_collateralSymbol], collateralTokensFromPayout); // this is the number of coins to trade (should have many 0's)

            _context5.next = 8;
            return (0, _trades.useTradeExactIn)(fromTokenAmount, _constants.TOKEN_LIST[loan.max_borrowedSymbol]);

          case 8:
            bestTrade = _context5.sent;
            minimumTokensAfterSwap = bestTrade ? BigInt(bestTrade.outputAmount.numerator) * BigInt(Math.pow(10, _constants.TOKEN_LIST[loan.max_borrowedSymbol].decimals)) / BigInt(bestTrade.outputAmount.denominator) : BigInt(0); //total profits (bonus_after_swap - flashLoanCost).to_eth - gasFee

            gasFee = gasCostToLiquidate(); //calc gas fee

            flashLoanPlusCost = flashLoanCost + flashLoanAmount;
            profitInBorrowCurrency = minimumTokensAfterSwap - flashLoanPlusCost;
            profitInEth = profitInBorrowCurrency * BigInt(loan.max_borrowedPriceInEth) / BigInt(Math.pow(10, _constants.TOKEN_LIST[loan.max_borrowedSymbol].decimals));
            profitInEthAfterGas = profitInEth - gasFee;

            if (profitInEthAfterGas > 0.1) {
              console.log("-------------------------------");
              console.log("user_ID:".concat(loan.user_id));
              console.log("HealthFactor ".concat(loan.healthFactor.toFixed(2)));
              console.log("flashLoanAmount ".concat(flashLoanAmount, " ").concat(loan.max_borrowedSymbol));
              console.log("flashLoanAmount converted to eth ".concat(flashLoanAmountInEth));
              console.log("flashLoanAmount converted to eth plus bonus ".concat(flashLoanAmountInEth_plusBonus));
              console.log("payout in collateral Tokens ".concat(collateralTokensFromPayout, " ").concat(loan.max_collateralSymbol));
              console.log("".concat(loan.max_borrowedSymbol, " received from swap ").concat(minimumTokensAfterSwap, " ").concat(loan.max_borrowedSymbol));
              bestTrade ? showPath(bestTrade) : console.log("no path");
              console.log("flashLoanPlusCost ".concat(flashLoanPlusCost));
              console.log("gasFee ".concat(gasFee));
              console.log("profitInEthAfterGas ".concat(Number(profitInEthAfterGas) / Math.pow(10, 18), "eth"));
            } //console.log(`user_ID:${loan.user_id} HealthFactor ${loan.healthFactor.toFixed(2)} allowedLiquidation ${flashLoanAmount.toFixed(2)} ${loan.max_collateralSymbol}->${loan.max_borrowedSymbol}` )
            //console.log(`minimumTokensAfterSwap ${minimumTokensAfterSwap} flashLoanCost ${flashLoanCost} gasFee ${gasFee} profit ${profit.toFixed(2)}`)


          case 16:
          case "end":
            return _context5.stop();
        }
      }
    }, _callee5);
  }));
  return _liquidationProfit.apply(this, arguments);
}

function gasCostToLiquidate() {
  return BigInt(_gas.gas_cost * GAS_USED_ESTIMATE);
} // percent is represented as a number less than 0 ie .75 is equivalent to 75%
// multiply base and percent and return a BigInt


function percentBigInt(base, percent) {
  return BigInt(base * BigInt(percent * 10000) / 10000n);
}

function showPath(trade) {
  var pathSymbol = "";
  var pathAddress = [];
  trade.route.path.map( /*#__PURE__*/function () {
    var _ref = _asyncToGenerator( /*#__PURE__*/regeneratorRuntime.mark(function _callee2(token) {
      return regeneratorRuntime.wrap(function _callee2$(_context2) {
        while (1) {
          switch (_context2.prev = _context2.next) {
            case 0:
              pathSymbol += token.symbol + "->";
              pathAddress.push(token.address);

            case 2:
            case "end":
              return _context2.stop();
          }
        }
      }, _callee2);
    }));

    return function (_x4) {
      return _ref.apply(this, arguments);
    };
  }());
  pathSymbol = pathSymbol.slice(0, -2);
  console.log("".concat(pathSymbol, " ").concat(JSON.stringify(pathAddress)));
  return [pathSymbol, pathAddress];
}