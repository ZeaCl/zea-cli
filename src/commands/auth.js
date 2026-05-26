import { loadConfig, saveConfig, handleDirectLogin, handleLogin } from '../client.js';

export function register(program) {
  const auth = program.command('auth').description('Authentication commands');

  auth.command('login')
    .description('Login interactively using browser')
    .option('--url <url>', 'ZEA API URL')
    .option('--email <email>', 'Email for direct login (requires --password)')
    .option('--password <password>', 'Password for direct login (requires --email)')
    .action(async (options) => {
      if (options.email && options.password) {
        await handleDirectLogin(options);
      } else {
        await handleLogin(options);
      }
    });

  auth.command('set-token <token>')
    .description('Configure a Personal Access Token (PAT) manually')
    .option('--url <url>', 'ZEA API URL')
    .action(async (token, options) => {
      const config = await loadConfig();
      config.token = token;
      if (options.url) config.apiUrl = options.url;
      await saveConfig(config);
      console.log('Personal Access Token saved successfully.');
    });
}
