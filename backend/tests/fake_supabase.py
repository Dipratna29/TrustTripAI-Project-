"""
Small in-memory stand-in for the supabase-py query builder used in unit tests.
Supports the subset of PostgREST filters the services use. Not a mock of results:
filters, ordering, ranges, counts and updates are actually evaluated over the rows.
"""

import copy
import itertools
from types import SimpleNamespace


# Primary key column of each live table (matches the Supabase schema)
PRIMARY_KEYS = {"users": "user_id", "user_devices": "device_id", "notifications": "notification_id",
                "geo_locations": "location_id", "guide": "g_id"}


class _Result(SimpleNamespace):
    pass


class _Query:
    def __init__(self, db, table):
        self.db, self.table = db, table
        self.filters, self.orders = [], []
        self.rng = None
        self.op, self.payload, self.count = "select", None, None
        self._negate = False

    # --- verbs -------------------------------------------------------------
    def select(self, _cols="*", count=None):
        self.op, self.count = "select", count
        return self

    def update(self, payload):
        self.op, self.payload = "update", payload
        return self

    def insert(self, payload):
        self.op, self.payload = "insert", payload
        return self

    # --- filters -----------------------------------------------------------
    @property
    def not_(self):
        self._negate = True
        return self

    def _add(self, fn):
        neg = self._negate
        self._negate = False
        self.filters.append((lambda r: not fn(r)) if neg else fn)
        return self

    def eq(self, col, val):
        return self._add(lambda r: r.get(col) == val)

    def neq(self, col, val):
        return self._add(lambda r: r.get(col) != val)

    def in_(self, col, vals):
        vals = list(vals)
        return self._add(lambda r: r.get(col) in vals)

    def is_(self, col, val):
        return self._add(lambda r: r.get(col) is None if val == "null" else r.get(col) == val)

    def gte(self, col, val):
        return self._add(lambda r: r.get(col) is not None and str(r.get(col)) >= str(val))

    def lte(self, col, val):
        return self._add(lambda r: r.get(col) is not None and str(r.get(col)) <= str(val))

    def ilike(self, col, pattern):
        p = pattern.lower().replace("%", "")
        starts, ends = not pattern.startswith("%"), not pattern.endswith("%")
        def match(r):
            v = str(r.get(col) or "").lower()
            if starts and ends:
                return v == p
            if starts:
                return v.startswith(p)
            if ends:
                return v.endswith(p)
            return p in v
        return self._add(match)

    def order(self, col, desc=False):
        self.orders.append((col, desc))
        return self

    def range(self, a, b):
        self.rng = (a, b)
        return self

    def limit(self, n):
        self.rng = (0, n - 1)
        return self

    # --- execution ---------------------------------------------------------
    def _rows(self):
        return self.db.tables.setdefault(self.table, [])

    def execute(self):
        rows = self._rows()
        if self.op == "insert":
            items = self.payload if isinstance(self.payload, list) else [self.payload]
            out = []
            pk = PRIMARY_KEYS.get(self.table, "id")
            for item in items:
                row = dict(item)
                row.setdefault(pk, next(self.db.ids))
                rows.append(row)
                out.append(copy.deepcopy(row))
            return _Result(data=out, count=None)

        matched = [r for r in rows if all(f(r) for f in self.filters)]
        if self.op == "update":
            for r in matched:
                r.update(self.payload)
            return _Result(data=copy.deepcopy(matched), count=None)

        for col, desc in reversed(self.orders):
            matched.sort(key=lambda r: (r.get(col) is None, r.get(col)), reverse=desc)
        total = len(matched)
        if self.rng:
            matched = matched[self.rng[0]: self.rng[1] + 1]
        return _Result(data=copy.deepcopy(matched), count=total if self.count else None)


class FakeSupabase:
    def __init__(self, tables=None):
        self.tables = copy.deepcopy(tables or {})
        self.ids = itertools.count(10_000)
        self.rpc_calls = []

    def table(self, name):
        return _Query(self, name)

    def rpc(self, name, params):
        self.rpc_calls.append((name, params))
        return SimpleNamespace(execute=lambda: _Result(data=None, count=None))
