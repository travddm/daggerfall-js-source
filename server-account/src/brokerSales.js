// AUDIT FB1024 - THE BROKER'S SALES BY THEIR REQUEST IDS.
//
// A press of the Broker's insignia (accounts.js buyInsignia) may carry a
// request id (`rid`, src/net/insignia.js BROKER_RID_RE). The sale writes `broker_sales` in its own
// batch, only where its write took, and refuses a `rid` this account has a row of: a FENCE (`fenced`), or the same press
// asked again (the sale's own answer, `again`). A client whose answer was lost asks `/v1/broker/settle` by the `rid`
// (settleBrokerSale): the row it wrote answers the sale - `held`, and which ask came first (`by`, the first ask's nonce:
// the piece is handed to that ask, never to a save loaded again that asks a second time); no row, and the id is fenced in
// the same statement, so the press can never write after the client gave its embers back. The cause it closes: the
// client asked "does the account hold a sale like this one?" - by the week and the piece - and an earlier honest sale,
// or the week turning, answered for a press that never landed (AUDIT FB1024 lanes B and C).

// Study prototype: the module's SQL lives in one of two copies, one a library each. This line picks the one in use.
export * from './broker-sales-kysely.js';
