"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/importers/monarch.ts
var monarch_exports = {};
__export(monarch_exports, {
  buildSnapshotFromImport: () => buildSnapshotFromImport,
  importMonarchFromString: () => importMonarchFromString,
  importMonarchInvestments: () => importMonarchInvestments,
  parseMonarchSnippet: () => parseMonarchSnippet
});
module.exports = __toCommonJS(monarch_exports);
function mapAccountType(monarchType, monarchSubtype, institutionName) {
  const t = (monarchSubtype || monarchType || "").toLowerCase();
  if (!institutionName && (!monarchType && !monarchSubtype)) return "other";
  if (t.includes("crypto")) return "crypto";
  if (t.includes("roth")) return "roth";
  if (t.includes("401k")) return "401k";
  if (t.includes("ira")) return "ira";
  if (t.includes("hsa")) return "hsa";
  if (t.includes("cash") || t.includes("checking") || t.includes("savings")) return "cash";
  return "taxable-brokerage";
}
function safeNumber(n) {
  const x = typeof n === "string" ? Number(n) : n;
  return typeof x === "number" && isFinite(x) ? x : void 0;
}
function parseMonarchSnippet(raw) {
  let s = (raw || "").trim();
  const tryParse = (t) => {
    const cleaned = t.replace(/,\s*([}\]])/g, "$1");
    return JSON.parse(cleaned);
  };
  try {
    if (s.startsWith("{") || s.startsWith("[")) return tryParse(s);
    if (s.startsWith('"aggregateHoldings"')) return tryParse(`{${s}}`);
    if (s.startsWith('"edges"')) return tryParse(`{${s}}`);
    const i = s.indexOf("{");
    const j = s.lastIndexOf("}");
    if (i !== -1 && j !== -1 && j > i) {
      return tryParse(s.slice(i, j + 1));
    }
  } catch (_) {
  }
  throw new Error("Unrecognized or invalid JSON snippet");
}
var DEFAULT_APPRECIATION = 0.035;
function normalizeLabel(value) {
  if (!value) return null;
  const cleaned = value.toLowerCase().replace(/[^a-z0-9]/g, "");
  return cleaned || null;
}
function extractAccountsPayload(raw) {
  const list = raw?.data?.accounts ?? raw?.accounts;
  if (!Array.isArray(list)) return [];
  const result = [];
  for (const entry of list) {
    const id = typeof entry?.id === "string" ? entry.id : void 0;
    if (!id) continue;
    const balances = Array.isArray(entry?.recentBalances) ? entry.recentBalances : [];
    let latestBalance;
    let latestDate;
    for (const bal of balances) {
      if (typeof bal === "number") {
        latestBalance = bal;
        continue;
      }
      const value = safeNumber(bal?.balance);
      if (value == null) continue;
      const dateStr = typeof bal?.date === "string" ? bal.date : void 0;
      if (!latestDate || dateStr && new Date(dateStr) > new Date(latestDate)) {
        latestBalance = value;
        latestDate = dateStr;
      }
    }
    if (latestBalance == null) latestBalance = 0;
    result.push({
      id,
      name: typeof entry?.name === "string" ? entry.name : void 0,
      typeName: typeof entry?.type?.name === "string" ? entry.type.name : void 0,
      typeDisplay: typeof entry?.type?.display === "string" ? entry.type.display : void 0,
      typeGroup: typeof entry?.type?.group === "string" ? entry.type.group : void 0,
      balance: latestBalance,
      asOf: latestDate,
      includeInNetWorth: entry?.includeInNetWorth !== false
    });
  }
  return result;
}
function resolveAccountCategory(acc) {
  const tokens = [acc.typeName, acc.typeDisplay, acc.typeGroup, acc.name].map((v) => typeof v === "string" ? v.toLowerCase().replace(/_/g, " ") : "").filter(Boolean);
  const text = tokens.join(" ");
  if (!text && typeof acc.typeName === "string") {
    const raw = acc.typeName.toLowerCase();
    if (raw === "real_estate") return "real-estate";
    if (raw === "loan") return "loan";
    if (raw === "depository") return "cash";
    if (raw === "brokerage" || raw === "investment") return "investment";
  }
  if (text.includes("real estate")) return "real-estate";
  if (text.includes("loan") || text.includes("mortgage") || text.includes("liability") || text.includes("credit")) return "loan";
  if (text.includes("depository") || text.includes("cash") || text.includes("bank") || text.includes("checking") || text.includes("savings")) return "cash";
  if (text.includes("investment") || text.includes("brokerage") || text.includes("retirement")) return "investment";
  return null;
}
function importMonarchInvestments(json, accountsPayload) {
  let edges = json?.data?.portfolio?.aggregateHoldings?.edges ?? json?.data?.aggregateHoldings?.edges ?? json?.aggregateHoldings?.edges ?? (Array.isArray(json?.edges) ? json.edges : void 0);
  if (!edges && Array.isArray(json)) {
    edges = json;
  }
  if (!Array.isArray(edges)) edges = [];
  const accountMap = /* @__PURE__ */ new Map();
  let positions = 0;
  let latestSync;
  const updateLatest = (ts) => {
    if (!ts) return;
    const date = new Date(ts);
    if (!Number.isFinite(date.valueOf())) return;
    if (!latestSync || date > new Date(latestSync)) {
      latestSync = date.toISOString();
    }
  };
  for (const e of edges) {
    const node = e?.node ?? e;
    if (!node) continue;
    positions++;
    const holdingsArr = Array.isArray(node.holdings) ? node.holdings : [];
    const security = node.security;
    const basisTotal = safeNumber(node.basis);
    const nodeTotalValue = safeNumber(node.totalValue);
    const sumValues = holdingsArr.reduce((s, h) => s + (safeNumber(h.value) || 0), 0);
    for (const hh of holdingsArr) {
      const account = hh?.account;
      const instName = account?.institution?.name || null;
      const isInstitutionless = !instName;
      let accountId;
      let accType;
      let accName;
      if (isInstitutionless) {
        const label = account?.displayName || "Unlinked";
        accountId = `other:${label}`;
        accType = "other";
        accName = `${label} (Other)`;
      } else {
        const baseId = account?.id;
        if (!baseId) continue;
        accountId = baseId;
        const accTypeRaw = mapAccountType(account?.type?.name, account?.subtype?.name || account?.subtype?.display, instName);
        accType = accTypeRaw;
        accName = account?.displayName || accountId;
        const isCryptoType = (hh?.type || "").toLowerCase() === "cryptocurrency";
        const tick = (hh?.ticker || security?.ticker || "").toUpperCase();
        const isCryptoTicker = /-USD$/.test(tick) || /^(BTC|ETH|SOL|ADA|DOGE|MATIC)$/.test(tick);
        if ((isCryptoType || isCryptoTicker) && accTypeRaw !== "crypto") {
          accountId = `${accountId}-crypto`;
          accType = "crypto";
          accName = `${account?.displayName || "Account"} (Crypto)`;
        }
      }
      if (!accountMap.has(accountId)) {
        accountMap.set(accountId, { id: accountId, type: accType, name: accName, holdings: [], cash_balance: 0 });
      }
      const units = safeNumber(hh.quantity) ?? 0;
      const hUpd = Date.parse(hh?.closingPriceUpdatedAt || "");
      const sUpd = Date.parse(security?.currentPriceUpdatedAt || "");
      const hPrice = safeNumber(hh.closingPrice);
      const sPrice = safeNumber(security?.currentPrice);
      const price = (isFinite(sUpd) && (!isFinite(hUpd) || sUpd > hUpd) ? sPrice : hPrice) ?? sPrice ?? hPrice ?? 0;
      const value = safeNumber(hh.value) ?? (units && price ? units * price : 0);
      let cost_basis;
      if (basisTotal && (nodeTotalValue || sumValues) && units) {
        const denom = nodeTotalValue || sumValues;
        const share = (value && denom ? value / denom : 0) * basisTotal;
        cost_basis = share / units;
      }
      const lot = {
        ticker: hh.ticker || security?.ticker || void 0,
        name: hh.name || security?.name || void 0,
        units,
        price: price || 0,
        cost_basis
      };
      accountMap.get(accountId).holdings.push(lot);
    }
    const sync = node.lastSyncedAt || security?.currentPriceUpdatedAt || holdingsArr[0]?.closingPriceUpdatedAt;
    if (typeof sync === "string") updateLatest(sync);
  }
  const balances = extractAccountsPayload(accountsPayload);
  const usedPropertyIds = /* @__PURE__ */ new Set();
  const ensurePropertyId = (base) => {
    const normalized = base.replace(/\s+/g, " ").trim() || "Property";
    let candidate = normalized;
    let counter = 2;
    while (usedPropertyIds.has(candidate)) {
      candidate = `${normalized} (${counter})`;
      counter += 1;
    }
    usedPropertyIds.add(candidate);
    return candidate;
  };
  const realEstateDrafts = [];
  const loanDrafts = [];
  const ensureAccountRecord = (accId, type, name) => {
    if (!accountMap.has(accId)) {
      accountMap.set(accId, { id: accId, type, name: name || accId, holdings: [], cash_balance: 0 });
    } else {
      const existing = accountMap.get(accId);
      if (!existing.name && name) existing.name = name;
      if (existing.type === "other" && type !== "other") existing.type = type;
    }
    return accountMap.get(accId);
  };
  for (const acc of balances) {
    if (!acc.includeInNetWorth) continue;
    updateLatest(acc.asOf);
    const category = resolveAccountCategory(acc);
    if (category === "investment") {
      continue;
    }
    if (category === "real-estate") {
      const label = ensurePropertyId(acc.name || acc.id);
      const entity = {
        id: label,
        value: Math.max(0, acc.balance || 0),
        appreciation_pct: DEFAULT_APPRECIATION
      };
      realEstateDrafts.push({ entity, accountId: acc.id, normalizedName: normalizeLabel(acc.name) || normalizeLabel(label) });
      continue;
    }
    if (category === "cash") {
      const balance = acc.balance || 0;
      const record2 = ensureAccountRecord(acc.id, balance >= 0 ? "cash" : "other", acc.name);
      record2.cash_balance = balance;
      continue;
    }
    if (category === "loan") {
      loanDrafts.push({
        accountId: acc.id,
        name: acc.name,
        normalizedName: normalizeLabel(acc.name) || normalizeLabel(acc.id),
        balance: Math.abs(acc.balance || 0)
      });
      continue;
    }
    const fallbackType = mapAccountType(acc.typeName, void 0, void 0);
    const record = ensureAccountRecord(acc.id, fallbackType, acc.name);
    if (!record.holdings || record.holdings.length === 0) {
      record.cash_balance = acc.balance || 0;
    }
  }
  const unmatchedLoans = [];
  for (const loan of loanDrafts) {
    const match = realEstateDrafts.find(
      (re) => re.accountId === loan.accountId || loan.normalizedName && re.normalizedName && (loan.normalizedName === re.normalizedName || loan.normalizedName.includes(re.normalizedName) || re.normalizedName.includes(loan.normalizedName))
    );
    if (match) {
      match.entity.mortgage_balance = loan.balance;
    } else {
      unmatchedLoans.push(loan);
    }
  }
  for (const loan of unmatchedLoans) {
    const target = accountMap.get(loan.accountId);
    const liability = -Math.abs(loan.balance);
    if (target) {
      target.cash_balance = (target.cash_balance || 0) + liability;
      if (!target.name && loan.name) target.name = loan.name;
    } else {
      accountMap.set(loan.accountId, {
        id: loan.accountId,
        type: "other",
        name: loan.name || loan.accountId,
        holdings: [],
        cash_balance: liability
      });
    }
  }
  const realEstate = realEstateDrafts.map((draft) => draft.entity);
  return { accounts: Array.from(accountMap.values()), realEstate, meta: { positions, accounts: accountMap.size, lastSyncedAt: latestSync } };
}
var DEFAULT_RETIREMENT = { expected_spend_monthly: 4e3, target_age: 60, withdrawal_strategy: "fixed-real" };
var DEFAULT_ASSUMPTIONS = { inflation_mode: "fixed", inflation_pct: 0.02, rebalancing: { frequency: "annual", threshold_pct: 0.2 } };
var DEFAULT_PERSON = { current_age: 35 };
function buildSnapshotFromImport(importResult, overrides) {
  return {
    timestamp: overrides?.timestamp ?? (/* @__PURE__ */ new Date()).toISOString(),
    currency: overrides?.currency ?? "USD",
    accounts: importResult.accounts,
    real_estate: overrides?.real_estate ?? importResult.realEstate ?? [],
    contributions: overrides?.contributions ?? [],
    expenses: overrides?.expenses ?? [],
    retirement: overrides?.retirement ?? { ...DEFAULT_RETIREMENT },
    social_security: overrides?.social_security ?? [],
    assumptions: overrides?.assumptions ?? { ...DEFAULT_ASSUMPTIONS },
    person: overrides?.person ?? { ...DEFAULT_PERSON }
  };
}
function importMonarchFromString(raw) {
  const obj = parseMonarchSnippet(raw);
  let wrapped = obj;
  if (!wrapped?.aggregateHoldings && (wrapped?.edges || wrapped?.__typename === "AggregateHoldingConnection")) {
    wrapped = { aggregateHoldings: wrapped };
  }
  return importMonarchInvestments(wrapped, obj);
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  buildSnapshotFromImport,
  importMonarchFromString,
  importMonarchInvestments,
  parseMonarchSnippet
});
