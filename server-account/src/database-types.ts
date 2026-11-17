// The row shapes of the tables that converted modules use, for Kysely's typed queries. Written by hand for now; a
// table is added here when its first module is converted.

import type { Generated } from 'kysely';

export interface BrokerSalesTable {
  account: string;
  rid: string;
  kind: string;
  item: string | null;
  at: number;
  settled: Generated<number>;
  asked_by: string | null;
}

export interface Database {
  broker_sales: BrokerSalesTable;
}
