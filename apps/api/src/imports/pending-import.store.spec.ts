import { PendingImportStore } from "./pending-import.store";

describe("PendingImportStore", () => {
  it("returns a stored entry only for the matching organizationId", () => {
    const store = new PendingImportStore();
    store.put({ importId: "imp-1", organizationId: "org-a", actorId: "user-1", createdAt: Date.now(), validRows: [] });

    expect(store.take("imp-1", "org-a")).toBeTruthy();
    expect(store.take("imp-1", "org-b")).toBeUndefined();
  });

  it("returns undefined for an unknown importId", () => {
    const store = new PendingImportStore();
    expect(store.take("does-not-exist", "org-a")).toBeUndefined();
  });

  it("evicts entries older than the TTL", () => {
    const store = new PendingImportStore();
    const THIRTY_ONE_MINUTES_AGO = Date.now() - 31 * 60 * 1000;
    store.put({ importId: "imp-old", organizationId: "org-a", actorId: "user-1", createdAt: THIRTY_ONE_MINUTES_AGO, validRows: [] });

    expect(store.take("imp-old", "org-a")).toBeUndefined();
  });

  it("delete() removes an entry so it cannot be committed twice", () => {
    const store = new PendingImportStore();
    store.put({ importId: "imp-1", organizationId: "org-a", actorId: "user-1", createdAt: Date.now(), validRows: [] });
    store.delete("imp-1");
    expect(store.take("imp-1", "org-a")).toBeUndefined();
  });
});
