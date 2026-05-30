#!/usr/bin/env python3
import sys, json, argparse
import pandas as pd
import requests

def parse_row(row, mapping, entity):
    data = {}
    for excel_col, db_field in mapping.get(entity, {}).items():
        val = row.get(excel_col)
        if pd.isna(val):
            continue
        if isinstance(val, pd.Timestamp):
            val = val.isoformat()
        elif isinstance(val, (float, int)):
            val = int(val * 100) if db_field.endswith('_amount') or db_field == 'amount' else int(val)
        data[db_field] = val
    return data

p = argparse.ArgumentParser()
p.add_argument('file')
p.add_argument('--map', required=True, help='JSON mapping file')
p.add_argument('--token', required=True)
p.add_argument('--base-url', default='http://venture-api:4081')
p.add_argument('--org-id', default='ea7b11ea-852c-44e5-aee1-a761ec76eaea')
args = p.parse_args()

with open(args.map) as f:
    mapping = json.load(f)

headers = {'Authorization': f'Bearer {args.token}', 'X-Zea-Org-Id': args.org_id, 'Content-Type': 'application/json'}
sheets = pd.read_excel(args.file, sheet_name=None)
result = {"imported": {}, "errors": []}

for entity in ['funds', 'investors', 'commitments', 'capital_calls', 'payments']:
    if entity not in sheets and entity not in mapping:
        continue
    df = sheets.get(entity) or sheets.get(list(sheets.keys())[0])
    url = f"{args.base_url}/gp/{entity}"
    count = 0
    for _, row in df.iterrows():
        data = parse_row(row, mapping, entity)
        try:
            resp = requests.post(url, json=data, headers=headers, timeout=30)
            if resp.status_code in (200, 201):
                count += 1
            else:
                result["errors"].append({"entity": entity, "row": count, "status": resp.status_code, "body": resp.text[:200]})
        except Exception as e:
            result["errors"].append({"entity": entity, "row": count, "error": str(e)})
    result["imported"][entity] = count

print(json.dumps(result, indent=2, ensure_ascii=False))
