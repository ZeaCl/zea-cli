#!/usr/bin/env python3
import sys, json
import pandas as pd

if len(sys.argv) < 2:
    print(json.dumps({"error": "Usage: parse_excel.py <file.xlsx>"}))
    sys.exit(1)

f = sys.argv[1]
sheets = pd.read_excel(f, sheet_name=None, nrows=0)

result = {"file": f, "sheets": {}, "total_sheets": len(sheets)}
for name, df in sheets.items():
    cols = []
    for c in df.columns:
        cols.append({"name": str(c), "dtype": str(df[c].dtype)})
    result["sheets"][name] = {"columns": cols, "row_count": len(pd.read_excel(f, sheet_name=name))}

print(json.dumps(result, indent=2, ensure_ascii=False))
