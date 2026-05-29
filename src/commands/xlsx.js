import { execSync } from 'child_process';

export function register(program) {
  const xlsxCmd = program.command('xlsx').description('Excel file operations: view, analyze');

  xlsxCmd.command('view')
    .description('View Excel file contents in terminal')
    .argument('<file>', 'Excel file path')
    .option('--sheet <name>', 'Specific sheet to view')
    .option('--json', 'Output as JSON')
    .action((file, opts) => {
      const sheetFilter = opts.sheet
        ? `for s in list(sheets): sheets.pop(s) if s != '${opts.sheet}' else None`
        : '';
      try {
        const result = execSync(`python3 -c "
import pandas as pd, json
f = '${file}'
sheets = pd.read_excel(f, sheet_name=None)
${sheetFilter}
if '${opts.json}' == 'true':
    out = {name: df.where(pd.notna(df), None).to_dict('records') for name, df in sheets.items()}
    print(json.dumps(out, indent=2, ensure_ascii=False, default=str))
else:
    for name, df in sheets.items():
        print(f'')
        print(f'─── {name} ({len(df)} rows x {len(df.columns)} cols) ───')
        print(f'')
        pd.set_option('display.max_columns', 20)
        pd.set_option('display.width', 200)
        pd.set_option('display.max_colwidth', 30)
        print(df.to_string(index=False))
"`, { encoding: 'utf8', timeout: 10000, maxBuffer: 10 * 1024 * 1024 });
        console.log(result);
      } catch (e) {
        console.error('Error:', e.message);
      }
    });
}
