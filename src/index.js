import {
  ApolloClient,
  InMemoryCache,
  ApolloProvider,
  useQuery, // useQuery
  gql
} from "@apollo/client";
import { render } from 'react-dom';
import React from 'react';

// NEED API KEY from TheGraph, only 1000 queries for free
const APIURL = 'https://gateway.thegraph.com/api/0e4dd82bb903490a86617f21d1937a3c/subgraphs/id/CvvUWXNtn8A5zVAtM8ob3JGq8kQS8BLrzL6WJV7FrHRy'

// TheGraph Main Query via Apollo Client
const tokensQuery = `
query GET_LOANS {
  users(first:1000, skip:0, orderBy: id, orderDirection: desc, where: {borrowedReservesCount_gt: 0}) {
    id
    borrowedReservesCount
    collateralReserve:reserves(where: {currentATokenBalance_gt: 0}) {
      currentATokenBalance
      reserve{
        usageAsCollateralEnabled
        reserveLiquidationThreshold
        reserveLiquidationBonus
        borrowingEnabled
        utilizationRate
        symbol
        underlyingAsset
        price {
          priceInEth
        }
        decimals
      }
    }
    borrowReserve: reserves(where: {currentTotalDebt_gt: 0}) {
      currentTotalDebt
      reserve{
        usageAsCollateralEnabled
        reserveLiquidationThreshold
        borrowingEnabled
        utilizationRate
        symbol
        underlyingAsset
        price {
          priceInEth
        }
        decimals
      }
    }
  }
}
`

// memory cache for data store
const client = new ApolloClient({
  uri: APIURL,
  cache: new InMemoryCache(),
})

client
  .query({
    query: gql(tokensQuery),
  })
  .then((data) => console.log('Subgraph data: ', data))
  .catch((err) => {
    console.log('Error fetching data: ', err)
  })

  function App() {
  return (
    <div>
      <h2>AAVE v2 User Data for Liquidation</h2>
    </div>
  );
}

render(
  <ApolloProvider client={client}>
    <App />
  </ApolloProvider>,
  document.getElementById('root'),
);


// import React from 'react';
// import { render } from 'react-dom';
// import {
//   ApolloClient,
//   InMemoryCache,
//   ApolloProvider,
//   useQuery,
//   gql
// } from "@apollo/client";

// const client = new ApolloClient({
//   uri: 'https://48p1r2roz4.sse.codesandbox.io',
//   cache: new InMemoryCache()
// });

// const EXCHANGE_RATES = gql`
//   query GetExchangeRates {
//     rates(currency: "USD") {
//       currency
//       rate
//     }
//   }
// `;

// function ExchangeRates() {
//   const { loading, error, data } = useQuery(EXCHANGE_RATES);

//   if (loading) return <p>Loading...</p>;
//   if (error) return <p>Error :(</p>;

//   return data.rates.map(({ currency, rate }) => (
//     <div key={currency}>
//       <p>
//         {currency}: {rate}
//       </p>
//     </div>
//   ));
// }

// function App() {
//   return (
//     <div>
//       <h2>My first Apollo app 🚀</h2>
//       <ExchangeRates />
//     </div>
//   );
// }

// render(
//   <ApolloProvider client={client}>
//     <App />
//   </ApolloProvider>,
//   document.getElementById('root'),
// );