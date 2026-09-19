/**
 * The retailer interface.
 *
 * Only the hand-verified connector ships. Everything downstream — the result page,
 * the alternatives ranking, the tests — talks to this interface and not to the
 * database, so adding the Amazon.ae Product Advertising API or a retailer
 * partnership is a new file plus one line in search.ts. See README, "Adding a live
 * retailer connector".
 */
import type { Listing } from "../schemas";

export type ConnectorQuery = {
  productId: string;
  barcode: string | null;
  name: string;
  brand: string | null;
};

export interface RetailerConnector {
  /** Matches Retailer.connector in the database. */
  readonly id: string;
  /** Human name, used in error messages and the admin page. */
  readonly label: string;
  /** Must never throw: a failing retailer degrades the list, it does not break the page. */
  search(query: ConnectorQuery): Promise<Listing[]>;
}

const registry = new Map<string, RetailerConnector>();

export function registerConnector(connector: RetailerConnector): void {
  registry.set(connector.id, connector);
}

export function connectors(): RetailerConnector[] {
  return [...registry.values()];
}

export function getConnector(id: string): RetailerConnector | undefined {
  return registry.get(id);
}
