"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseMonarchSnippet = parseMonarchSnippet;
exports.importMonarchInvestments = importMonarchInvestments;
exports.buildSnapshotFromImport = buildSnapshotFromImport;
exports.importMonarchFromString = importMonarchFromString;
function mapAccountType(monarchType, monarchSubtype, institutionName) {
    var t = (monarchSubtype || monarchType || '').toLowerCase();
    if (!institutionName && (!monarchType && !monarchSubtype))
        return 'other';
    if (t.includes('crypto'))
        return 'crypto';
    if (t.includes('roth'))
        return 'roth';
    if (t.includes('401k'))
        return '401k';
    if (t.includes('ira'))
        return 'ira';
    if (t.includes('hsa'))
        return 'hsa';
    if (t.includes('cash') || t.includes('checking') || t.includes('savings'))
        return 'cash';
    return 'taxable-brokerage';
}
function safeNumber(n) {
    var x = typeof n === 'string' ? Number(n) : n;
    return typeof x === 'number' && isFinite(x) ? x : undefined;
}
function parseMonarchSnippet(raw) {
    var s = (raw || '').trim();
    var tryParse = function (t) {
        // remove trailing commas that break strict JSON
        var cleaned = t.replace(/,\s*([}\]])/g, '$1');
        return JSON.parse(cleaned);
    };
    try {
        if (s.startsWith('{') || s.startsWith('['))
            return tryParse(s);
        if (s.startsWith('"aggregateHoldings"'))
            return tryParse("{".concat(s, "}"));
        if (s.startsWith('"edges"'))
            return tryParse("{".concat(s, "}"));
        // attempt to extract first {...} block
        var i = s.indexOf('{');
        var j = s.lastIndexOf('}');
        if (i !== -1 && j !== -1 && j > i) {
            return tryParse(s.slice(i, j + 1));
        }
    }
    catch (_) {
        // fall through
    }
    throw new Error('Unrecognized or invalid JSON snippet');
}
var DEFAULT_APPRECIATION = 0.035;
function normalizeLabel(value) {
    if (!value)
        return null;
    var cleaned = value.toLowerCase().replace(/[^a-z0-9]/g, '');
    return cleaned || null;
}
function extractAccountsPayload(raw) {
    var _a, _b, _c, _d, _e;
    var list = (_b = (_a = raw === null || raw === void 0 ? void 0 : raw.data) === null || _a === void 0 ? void 0 : _a.accounts) !== null && _b !== void 0 ? _b : raw === null || raw === void 0 ? void 0 : raw.accounts;
    if (!Array.isArray(list))
        return [];
    var result = [];
    for (var _i = 0, list_1 = list; _i < list_1.length; _i++) {
        var entry = list_1[_i];
        var id = typeof (entry === null || entry === void 0 ? void 0 : entry.id) === 'string' ? entry.id : undefined;
        if (!id)
            continue;
        var balances = Array.isArray(entry === null || entry === void 0 ? void 0 : entry.recentBalances) ? entry.recentBalances : [];
        var latestBalance = void 0;
        var latestDate = void 0;
        for (var _f = 0, balances_1 = balances; _f < balances_1.length; _f++) {
            var bal = balances_1[_f];
            if (typeof bal === 'number') {
                latestBalance = bal;
                continue;
            }
            var value = safeNumber(bal === null || bal === void 0 ? void 0 : bal.balance);
            if (value == null)
                continue;
            var dateStr = typeof (bal === null || bal === void 0 ? void 0 : bal.date) === 'string' ? bal.date : undefined;
            if (!latestDate || (dateStr && new Date(dateStr) > new Date(latestDate))) {
                latestBalance = value;
                latestDate = dateStr;
            }
        }
        if (latestBalance == null)
            latestBalance = 0;
        result.push({
            id: id,
            name: typeof (entry === null || entry === void 0 ? void 0 : entry.name) === 'string' ? entry.name : undefined,
            typeName: typeof ((_c = entry === null || entry === void 0 ? void 0 : entry.type) === null || _c === void 0 ? void 0 : _c.name) === 'string' ? entry.type.name : undefined,
            typeDisplay: typeof ((_d = entry === null || entry === void 0 ? void 0 : entry.type) === null || _d === void 0 ? void 0 : _d.display) === 'string' ? entry.type.display : undefined,
            typeGroup: typeof ((_e = entry === null || entry === void 0 ? void 0 : entry.type) === null || _e === void 0 ? void 0 : _e.group) === 'string' ? entry.type.group : undefined,
            balance: latestBalance,
            asOf: latestDate,
            includeInNetWorth: (entry === null || entry === void 0 ? void 0 : entry.includeInNetWorth) !== false
        });
    }
    return result;
}
function resolveAccountCategory(acc) {
    var tokens = [acc.typeName, acc.typeDisplay, acc.typeGroup, acc.name]
        .map(function (v) { return (typeof v === 'string' ? v.toLowerCase().replace(/_/g, ' ') : ''); })
        .filter(Boolean);
    var text = tokens.join(' ');
    if (!text && typeof acc.typeName === 'string') {
        var raw = acc.typeName.toLowerCase();
        if (raw === 'real_estate')
            return 'real-estate';
        if (raw === 'loan')
            return 'loan';
        if (raw === 'depository')
            return 'cash';
    }
    if (text.includes('real estate'))
        return 'real-estate';
    if (text.includes('loan') || text.includes('mortgage') || text.includes('liability') || text.includes('credit'))
        return 'loan';
    if (text.includes('depository') || text.includes('cash') || text.includes('bank') || text.includes('checking') || text.includes('savings'))
        return 'cash';
    return null;
}
function importMonarchInvestments(json, accountsPayload) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v;
    // Accept a variety of GraphQL-like shapes
    var edges = (_j = (_g = (_d = (_c = (_b = (_a = json === null || json === void 0 ? void 0 : json.data) === null || _a === void 0 ? void 0 : _a.portfolio) === null || _b === void 0 ? void 0 : _b.aggregateHoldings) === null || _c === void 0 ? void 0 : _c.edges) !== null && _d !== void 0 ? _d : (_f = (_e = json === null || json === void 0 ? void 0 : json.data) === null || _e === void 0 ? void 0 : _e.aggregateHoldings) === null || _f === void 0 ? void 0 : _f.edges) !== null && _g !== void 0 ? _g : (_h = json === null || json === void 0 ? void 0 : json.aggregateHoldings) === null || _h === void 0 ? void 0 : _h.edges) !== null && _j !== void 0 ? _j : (Array.isArray(json === null || json === void 0 ? void 0 : json.edges) ? json.edges : undefined);
    if (!edges && Array.isArray(json)) {
        // maybe directly an array of nodes
        edges = json;
    }
    if (!Array.isArray(edges))
        edges = [];
    var accountMap = new Map();
    var positions = 0;
    var latestSync;
    var updateLatest = function (ts) {
        if (!ts)
            return;
        var date = new Date(ts);
        if (!Number.isFinite(date.valueOf()))
            return;
        if (!latestSync || date > new Date(latestSync)) {
            latestSync = date.toISOString();
        }
    };
    for (var _i = 0, edges_1 = edges; _i < edges_1.length; _i++) {
        var e = edges_1[_i];
        var node = (_k = e === null || e === void 0 ? void 0 : e.node) !== null && _k !== void 0 ? _k : e;
        if (!node)
            continue;
        positions++;
        var holdingsArr = Array.isArray(node.holdings) ? node.holdings : [];
        var security = node.security;
        var basisTotal = safeNumber(node.basis);
        var nodeTotalValue = safeNumber(node.totalValue);
        var sumValues = holdingsArr.reduce(function (s, h) { return s + (safeNumber(h.value) || 0); }, 0);
        for (var _w = 0, holdingsArr_1 = holdingsArr; _w < holdingsArr_1.length; _w++) {
            var hh = holdingsArr_1[_w];
            var account = hh === null || hh === void 0 ? void 0 : hh.account;
            var instName = ((_l = account === null || account === void 0 ? void 0 : account.institution) === null || _l === void 0 ? void 0 : _l.name) || null;
            var isInstitutionless = !instName;
            // Determine target account id, type, and name
            var accountId = void 0;
            var accType = void 0;
            var accName = void 0;
            if (isInstitutionless) {
                // Group into an 'other' synthetic account keyed by displayName to avoid mixing unrelated holdings
                var label = ((account === null || account === void 0 ? void 0 : account.displayName) || 'Unlinked');
                accountId = "other:".concat(label);
                accType = 'other';
                accName = "".concat(label, " (Other)");
            }
            else {
                // Use the real account id and map the type
                var baseId = account === null || account === void 0 ? void 0 : account.id;
                if (!baseId)
                    continue;
                accountId = baseId;
                var accTypeRaw = mapAccountType((_m = account === null || account === void 0 ? void 0 : account.type) === null || _m === void 0 ? void 0 : _m.name, ((_o = account === null || account === void 0 ? void 0 : account.subtype) === null || _o === void 0 ? void 0 : _o.name) || ((_p = account === null || account === void 0 ? void 0 : account.subtype) === null || _p === void 0 ? void 0 : _p.display), instName);
                accType = accTypeRaw;
                accName = (account === null || account === void 0 ? void 0 : account.displayName) || accountId;
                // If crypto position was grouped under non-crypto account, split into a synthetic crypto view
                var isCryptoType = ((hh === null || hh === void 0 ? void 0 : hh.type) || '').toLowerCase() === 'cryptocurrency';
                var tick = ((hh === null || hh === void 0 ? void 0 : hh.ticker) || (security === null || security === void 0 ? void 0 : security.ticker) || '').toUpperCase();
                var isCryptoTicker = /-USD$/.test(tick) || /^(BTC|ETH|SOL|ADA|DOGE|MATIC)$/.test(tick);
                if ((isCryptoType || isCryptoTicker) && accTypeRaw !== 'crypto') {
                    accountId = "".concat(accountId, "-crypto");
                    accType = 'crypto';
                    accName = "".concat(((account === null || account === void 0 ? void 0 : account.displayName) || 'Account'), " (Crypto)");
                }
            }
            if (!accountMap.has(accountId)) {
                accountMap.set(accountId, { id: accountId, type: accType, name: accName, holdings: [], cash_balance: 0 });
            }
            // Position values and proportional basis
            var units = (_q = safeNumber(hh.quantity)) !== null && _q !== void 0 ? _q : 0;
            // Prefer security.currentPrice if its timestamp is newer than holding's closingPriceUpdatedAt
            var hUpd = Date.parse((hh === null || hh === void 0 ? void 0 : hh.closingPriceUpdatedAt) || '');
            var sUpd = Date.parse((security === null || security === void 0 ? void 0 : security.currentPriceUpdatedAt) || '');
            var hPrice = safeNumber(hh.closingPrice);
            var sPrice = safeNumber(security === null || security === void 0 ? void 0 : security.currentPrice);
            var price = (_t = (_s = (_r = (isFinite(sUpd) && (!isFinite(hUpd) || sUpd > hUpd) ? sPrice : hPrice)) !== null && _r !== void 0 ? _r : sPrice) !== null && _s !== void 0 ? _s : hPrice) !== null && _t !== void 0 ? _t : 0;
            var value = (_u = safeNumber(hh.value)) !== null && _u !== void 0 ? _u : (units && price ? units * price : 0);
            var cost_basis = void 0;
            if (basisTotal && (nodeTotalValue || sumValues) && units) {
                var denom = nodeTotalValue || sumValues;
                var share = (value && denom ? (value / denom) : 0) * basisTotal;
                cost_basis = share / units;
            }
            var lot = {
                ticker: hh.ticker || (security === null || security === void 0 ? void 0 : security.ticker) || undefined,
                name: (hh.name || (security === null || security === void 0 ? void 0 : security.name) || undefined),
                units: units,
                price: price || 0,
                cost_basis: cost_basis,
            };
            accountMap.get(accountId).holdings.push(lot);
        }
        var sync = node.lastSyncedAt || (security === null || security === void 0 ? void 0 : security.currentPriceUpdatedAt) || ((_v = holdingsArr[0]) === null || _v === void 0 ? void 0 : _v.closingPriceUpdatedAt);
        if (typeof sync === 'string')
            updateLatest(sync);
    }
    var balances = extractAccountsPayload(accountsPayload);
    var usedPropertyIds = new Set();
    var ensurePropertyId = function (base) {
        var normalized = base.replace(/\s+/g, ' ').trim() || 'Property';
        var candidate = normalized;
        var counter = 2;
        while (usedPropertyIds.has(candidate)) {
            candidate = "".concat(normalized, " (").concat(counter, ")");
            counter += 1;
        }
        usedPropertyIds.add(candidate);
        return candidate;
    };
    var realEstateDrafts = [];
    var loanDrafts = [];
    var ensureAccountRecord = function (accId, type, name) {
        if (!accountMap.has(accId)) {
            accountMap.set(accId, { id: accId, type: type, name: name || accId, holdings: [], cash_balance: 0 });
        }
        else {
            var existing = accountMap.get(accId);
            if (!existing.name && name)
                existing.name = name;
            if (existing.type === 'other' && type !== 'other')
                existing.type = type;
        }
        return accountMap.get(accId);
    };
    for (var _x = 0, balances_2 = balances; _x < balances_2.length; _x++) {
        var acc = balances_2[_x];
        if (!acc.includeInNetWorth)
            continue;
        updateLatest(acc.asOf);
        var category = resolveAccountCategory(acc);
        if (category === 'real_estate') {
            var label = ensurePropertyId(acc.name || acc.id);
            var entity = {
                id: label,
                value: Math.max(0, acc.balance || 0),
                appreciation_pct: DEFAULT_APPRECIATION
            };
            realEstateDrafts.push({ entity: entity, accountId: acc.id, normalizedName: normalizeLabel(acc.name) || normalizeLabel(label) });
            continue;
        }
        if (category === 'cash') {
            var balance = acc.balance || 0;
            var record_1 = ensureAccountRecord(acc.id, balance >= 0 ? 'cash' : 'other', acc.name);
            record_1.cash_balance = balance;
            continue;
        }
        if (category === 'loan') {
            loanDrafts.push({
                accountId: acc.id,
                name: acc.name,
                normalizedName: normalizeLabel(acc.name) || normalizeLabel(acc.id),
                balance: Math.abs(acc.balance || 0)
            });
            continue;
        }
        // Fallback: create an account entry using the reported balance.
        var fallbackType = mapAccountType(acc.typeName, undefined, undefined);
        var record = ensureAccountRecord(acc.id, fallbackType, acc.name);
        if (!record.holdings || record.holdings.length === 0) {
            record.cash_balance = acc.balance || 0;
        }
    }
    var unmatchedLoans = [];
    var _loop_1 = function (loan) {
        var match = realEstateDrafts.find(function (re) {
            return re.accountId === loan.accountId ||
                (loan.normalizedName && re.normalizedName && (loan.normalizedName === re.normalizedName ||
                    loan.normalizedName.includes(re.normalizedName) ||
                    re.normalizedName.includes(loan.normalizedName)));
        });
        if (match) {
            match.entity.mortgage_balance = loan.balance;
        }
        else {
            unmatchedLoans.push(loan);
        }
    };
    for (var _y = 0, loanDrafts_1 = loanDrafts; _y < loanDrafts_1.length; _y++) {
        var loan = loanDrafts_1[_y];
        _loop_1(loan);
    }
    for (var _z = 0, unmatchedLoans_1 = unmatchedLoans; _z < unmatchedLoans_1.length; _z++) {
        var loan = unmatchedLoans_1[_z];
        var target = accountMap.get(loan.accountId);
        var liability = -Math.abs(loan.balance);
        if (target) {
            target.cash_balance = (target.cash_balance || 0) + liability;
            if (!target.name && loan.name)
                target.name = loan.name;
        }
        else {
            accountMap.set(loan.accountId, {
                id: loan.accountId,
                type: 'other',
                name: loan.name || loan.accountId,
                holdings: [],
                cash_balance: liability
            });
        }
    }
    var realEstate = realEstateDrafts.map(function (draft) { return draft.entity; });
    return { accounts: Array.from(accountMap.values()), realEstate: realEstate, meta: { positions: positions, accounts: accountMap.size, lastSyncedAt: latestSync } };
}
var DEFAULT_RETIREMENT = { expected_spend_monthly: 4000, target_age: 60, withdrawal_strategy: 'fixed-real' };
var DEFAULT_ASSUMPTIONS = { inflation_mode: 'fixed', inflation_pct: 0.02, rebalancing: { frequency: 'annual', threshold_pct: 0.2 } };
var DEFAULT_PERSON = { current_age: 35 };
function buildSnapshotFromImport(importResult, overrides) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
    return {
        timestamp: (_a = overrides === null || overrides === void 0 ? void 0 : overrides.timestamp) !== null && _a !== void 0 ? _a : new Date().toISOString(),
        currency: (_b = overrides === null || overrides === void 0 ? void 0 : overrides.currency) !== null && _b !== void 0 ? _b : 'USD',
        accounts: importResult.accounts,
        real_estate: (_d = (_c = overrides === null || overrides === void 0 ? void 0 : overrides.real_estate) !== null && _c !== void 0 ? _c : importResult.realEstate) !== null && _d !== void 0 ? _d : [],
        contributions: (_e = overrides === null || overrides === void 0 ? void 0 : overrides.contributions) !== null && _e !== void 0 ? _e : [],
        expenses: (_f = overrides === null || overrides === void 0 ? void 0 : overrides.expenses) !== null && _f !== void 0 ? _f : [],
        retirement: (_g = overrides === null || overrides === void 0 ? void 0 : overrides.retirement) !== null && _g !== void 0 ? _g : __assign({}, DEFAULT_RETIREMENT),
        social_security: (_h = overrides === null || overrides === void 0 ? void 0 : overrides.social_security) !== null && _h !== void 0 ? _h : [],
        assumptions: (_j = overrides === null || overrides === void 0 ? void 0 : overrides.assumptions) !== null && _j !== void 0 ? _j : __assign({}, DEFAULT_ASSUMPTIONS),
        person: (_k = overrides === null || overrides === void 0 ? void 0 : overrides.person) !== null && _k !== void 0 ? _k : __assign({}, DEFAULT_PERSON)
    };
}
function importMonarchFromString(raw) {
    var obj = parseMonarchSnippet(raw);
    // If the parsed object itself is the aggregateHoldings value, wrap it
    var wrapped = obj;
    if (!(wrapped === null || wrapped === void 0 ? void 0 : wrapped.aggregateHoldings) && ((wrapped === null || wrapped === void 0 ? void 0 : wrapped.edges) || (wrapped === null || wrapped === void 0 ? void 0 : wrapped.__typename) === 'AggregateHoldingConnection')) {
        wrapped = { aggregateHoldings: wrapped };
    }
    return importMonarchInvestments(wrapped, obj);
}
/*
Monarch investments importer (GraphQL aggregate holdings + accounts balances).
- Groups positions by holding.account; institutionless → synthetic 'Other'.
- Crypto under non-crypto → synthetic '(Crypto)' account to avoid mixing.
- Price selection prefers fresher security.currentPrice over stale holding closingPrice.
- Populates HoldingLot.name from holding/security when available.
- Merges Monarch accounts payload to fill cash balances, real estate values, and mortgage liabilities.
*/
