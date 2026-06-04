import { getClient } from '../client.js';
import zeaFetch from '../lib/http.js';
import { execSync } from 'child_process';
import fs from 'fs/promises';

export function register(program) {
  const nutrition = program.command('nutrition')
    .description('Nutrition domain commands (Nutrition API)');

  // ─── meal ───────────────────────────────────────────────────
  const nutritionMeal = nutrition.command('meal')
    .description('Meal record management');

  nutritionMeal.command('list')
    .description('List meals for a user on a given date')
    .requiredOption('--user-id <id>', 'User ID')
    .option('--date <date>', 'Date (YYYY-MM-DD, default: today)')
    .option('--meal-type <type>', 'Meal type filter (breakfast, lunch, dinner, snack)')
    .action(async (opts) => {
      try {
        const client = await getClient();
        const orgId = client.activeOrgId;
        const headers = { ...client.headers };
        if (orgId) headers['X-Zea-Org-Id'] = orgId;

        const date = opts.date || new Date().toISOString().split('T')[0];
        let url = `${client.nutritionUrl || 'http://localhost:4085'}/nt/meals?user_id=${opts.userId}&date=${date}`;
        if (opts.mealType) url += `&meal_type=${opts.mealType}`;

        const response = await zeaFetch(url, { headers });
        if (!response.ok) {
          const err = await response.json();
          throw new Error(err.error || err.detail || `HTTP ${response.status}`);
        }
        const meals = await response.json();
        if (!meals || meals.length === 0) {
          console.log(`No meals found for ${date}.`);
          return;
        }
        console.log(`Meals for ${date}:`);
        meals.forEach(m => {
          console.log(`  ${m.id}: [${m.meal_type}] ${m.food_name} — ${m.calories} kcal | P:${m.proteins}g C:${m.carbs}g F:${m.fats}g`);
        });
      } catch (e) {
        console.error('Error:', e.message);
      }
    });

  nutritionMeal.command('create')
    .description('Register a meal with nutrition data')
    .requiredOption('--user-id <id>', 'User ID')
    .requiredOption('--name <name>', 'Food name')
    .requiredOption('--calories <kcal>', 'Calories')
    .requiredOption('--proteins <g>', 'Proteins in grams')
    .requiredOption('--carbs <g>', 'Carbs in grams')
    .requiredOption('--fats <g>', 'Fats in grams')
    .option('--meal-type <type>', 'Meal type (breakfast, lunch, dinner, snack)', 'snack')
    .option('--image-url <url>', 'Food image URL')
    .option('--sugars <g>', 'Sugars in grams')
    .option('--fiber <g>', 'Fiber in grams')
    .option('--sodium <mg>', 'Sodium in mg')
    .option('--daily-record-id <id>', 'Daily record ID')
    .action(async (opts) => {
      try {
        const client = await getClient();
        const orgId = client.activeOrgId;
        const headers = { ...client.headers, 'Content-Type': 'application/json' };
        if (orgId) headers['X-Zea-Org-Id'] = orgId;

        const body = {
          user_id: opts.userId,
          food_name: opts.name,
          meal_type: opts.mealType,
          calories: parseFloat(opts.calories),
          proteins: parseFloat(opts.proteins),
          carbs: parseFloat(opts.carbs),
          fats: parseFloat(opts.fats)
        };
        if (opts.imageUrl) body.food_image_url = opts.imageUrl;
        if (opts.sugars) body.sugars = parseFloat(opts.sugars);
        if (opts.fiber) body.fiber = parseFloat(opts.fiber);
        if (opts.sodium) body.sodium = parseFloat(opts.sodium);
        if (opts.dailyRecordId) body.daily_record_id = opts.dailyRecordId;

        const response = await zeaFetch(`${client.nutritionUrl || 'http://localhost:4085'}/nt/meals`, {
          method: 'POST', headers, body: JSON.stringify(body)
        });
        if (!response.ok) {
          const err = await response.json();
          throw new Error(err.error || err.detail || `HTTP ${response.status}`);
        }
        const meal = await response.json();
        console.log(`Meal registered: ${meal.food_name} (${meal.id})`);
        console.log(`  ${meal.calories} kcal | P:${meal.proteins}g C:${meal.carbs}g F:${meal.fats}g`);
      } catch (e) {
        console.error('Error:', e.message);
      }
    });

  nutritionMeal.command('show <id>')
    .description('Show meal details')
    .action(async (mealId) => {
      try {
        const client = await getClient();
        const orgId = client.activeOrgId;
        const headers = { ...client.headers };
        if (orgId) headers['X-Zea-Org-Id'] = orgId;

        const response = await zeaFetch(`${client.nutritionUrl || 'http://localhost:4085'}/nt/meals/${mealId}`, { headers });
        if (!response.ok) {
          const err = await response.json();
          throw new Error(err.error || err.detail || `HTTP ${response.status}`);
        }
        const m = await response.json();
        console.log(`Meal: ${m.food_name} (${m.id})`);
        console.log(`Type: ${m.meal_type} | Date: ${m.recorded_at || m.created_at}`);
        console.log(`Calories: ${m.calories} kcal`);
        console.log(`Proteins: ${m.proteins}g | Carbs: ${m.carbs}g | Fats: ${m.fats}g`);
        if (m.sugars) console.log(`Sugars: ${m.sugars}g`);
        if (m.fiber) console.log(`Fiber: ${m.fiber}g`);
        if (m.sodium) console.log(`Sodium: ${m.sodium}mg`);
        if (m.food_image_url) console.log(`Image: ${m.food_image_url}`);
        if (m.ingredients) console.log(`Ingredients: ${JSON.stringify(m.ingredients)}`);
      } catch (e) {
        console.error('Error:', e.message);
      }
    });

  nutritionMeal.command('delete <id>')
    .description('Delete a meal record')
    .action(async (mealId) => {
      try {
        const client = await getClient();
        const orgId = client.activeOrgId;
        const headers = { ...client.headers };
        if (orgId) headers['X-Zea-Org-Id'] = orgId;

        const response = await zeaFetch(`${client.nutritionUrl || 'http://localhost:4085'}/nt/meals/${mealId}`, {
          method: 'DELETE', headers
        });
        if (!response.ok) {
          const err = await response.json();
          throw new Error(err.error || err.detail || `HTTP ${response.status}`);
        }
        console.log(`Meal ${mealId} deleted.`);
      } catch (e) {
        console.error('Error:', e.message);
      }
    });

  // ─── profile ────────────────────────────────────────────────
  const nutritionProfile = nutrition.command('profile')
    .description('User nutrition profile management');

  nutritionProfile.command('get')
    .description('Get nutrition profile for a user')
    .requiredOption('--user-id <id>', 'User ID')
    .action(async (opts) => {
      try {
        const client = await getClient();
        const orgId = client.activeOrgId;
        const headers = { ...client.headers };
        if (orgId) headers['X-Zea-Org-Id'] = orgId;

        const response = await zeaFetch(`${client.nutritionUrl || 'http://localhost:4085'}/nt/profiles/${opts.userId}`, { headers });
        if (!response.ok) {
          const err = await response.json();
          throw new Error(err.error || err.detail || `HTTP ${response.status}`);
        }
        const p = await response.json();
        console.log(`Profile: ${p.user_id}`);
        if (p.gender) console.log(`  Gender: ${p.gender}`);
        if (p.birth_date) console.log(`  Birth Date: ${p.birth_date}`);
        if (p.weight_kg) console.log(`  Weight: ${p.weight_kg} kg`);
        if (p.height_cm) console.log(`  Height: ${p.height_cm} cm`);
        if (p.weight_kg && p.height_cm) {
          const bmi = (p.weight_kg / ((p.height_cm / 100) ** 2)).toFixed(1);
          console.log(`  BMI: ${bmi}`);
        }
        if (p.activity_level) console.log(`  Activity: ${p.activity_level}`);
        if (p.diet_type) console.log(`  Diet: ${p.diet_type}`);
      } catch (e) {
        console.error('Error:', e.message);
      }
    });

  nutritionProfile.command('update')
    .description('Update nutrition profile fields')
    .requiredOption('--user-id <id>', 'User ID')
    .option('--gender <gender>', 'Gender (male, female, other, prefer_not_to_say)')
    .option('--birth-date <date>', 'Birth date (YYYY-MM-DD)')
    .option('--weight <kg>', 'Weight in kg')
    .option('--height <cm>', 'Height in cm')
    .option('--activity-level <level>', 'Activity level')
    .option('--diet-type <type>', 'Diet type')
    .action(async (opts) => {
      try {
        const client = await getClient();
        const orgId = client.activeOrgId;
        const headers = { ...client.headers, 'Content-Type': 'application/json' };
        if (orgId) headers['X-Zea-Org-Id'] = orgId;

        const body = {};
        if (opts.gender) body.gender = opts.gender;
        if (opts.birthDate) body.birth_date = opts.birthDate;
        if (opts.weight) body.weight_kg = parseFloat(opts.weight);
        if (opts.height) body.height_cm = parseFloat(opts.height);
        if (opts.activityLevel) body.activity_level = opts.activityLevel;
        if (opts.dietType) body.diet_type = opts.dietType;

        const response = await zeaFetch(`${client.nutritionUrl || 'http://localhost:4085'}/nt/profiles/${opts.userId}`, {
          method: 'PUT', headers, body: JSON.stringify(body)
        });
        if (!response.ok) {
          const err = await response.json();
          throw new Error(err.error || err.detail || `HTTP ${response.status}`);
        }
        const p = await response.json();
        console.log(`Profile updated: ${p.user_id}`);
        if (p.weight_kg && p.height_cm) {
          const bmi = (p.weight_kg / ((p.height_cm / 100) ** 2)).toFixed(1);
          console.log(`  BMI: ${bmi}`);
        }
      } catch (e) {
        console.error('Error:', e.message);
      }
    });

  // ─── daily-record ───────────────────────────────────────────
  const nutritionDaily = nutrition.command('daily-record')
    .description('Daily nutrition summary');

  nutritionDaily.command('get')
    .description('Get daily record (auto-creates if missing)')
    .requiredOption('--user-id <id>', 'User ID')
    .option('--date <date>', 'Date (YYYY-MM-DD, default: today)')
    .action(async (opts) => {
      try {
        const client = await getClient();
        const orgId = client.activeOrgId;
        const headers = { ...client.headers };
        if (orgId) headers['X-Zea-Org-Id'] = orgId;

        const date = opts.date || new Date().toISOString().split('T')[0];
        const response = await zeaFetch(`${client.nutritionUrl || 'http://localhost:4085'}/nt/daily-records?user_id=${opts.userId}&date=${date}`, { headers });
        if (!response.ok) {
          const err = await response.json();
          throw new Error(err.error || err.detail || `HTTP ${response.status}`);
        }
        const d = await response.json();
        console.log(`Daily Record: ${d.record_date}`);
        console.log(`Goals: ${d.calorie_goal} kcal | P:${d.protein_goal}g C:${d.carbs_goal}g F:${d.fat_goal}g | Water:${d.hydration_goal}ml`);
        console.log(`Consumed: ${d.total_calories || 0}/${d.calorie_goal} kcal | P:${d.total_proteins || 0}g C:${d.total_carbs || 0}g F:${d.total_fats || 0}g | Water:${d.total_hydration || 0}ml`);
        if (d.meals && d.meals.length > 0) {
          console.log(`Meals (${d.meals.length}):`);
          d.meals.forEach(m => console.log(`  [${m.meal_type}] ${m.food_name} — ${m.calories} kcal`));
        }
      } catch (e) {
        console.error('Error:', e.message);
      }
    });

  // ─── hydration ──────────────────────────────────────────────
  const nutritionHydration = nutrition.command('hydration')
    .description('Hydration tracking');

  nutritionHydration.command('get')
    .description('Get hydration records for a date')
    .requiredOption('--user-id <id>', 'User ID')
    .option('--date <date>', 'Date (YYYY-MM-DD, default: today)')
    .action(async (opts) => {
      try {
        const client = await getClient();
        const orgId = client.activeOrgId;
        const headers = { ...client.headers };
        if (orgId) headers['X-Zea-Org-Id'] = orgId;

        const date = opts.date || new Date().toISOString().split('T')[0];
        const response = await zeaFetch(`${client.nutritionUrl || 'http://localhost:4085'}/nt/hydration?user_id=${opts.userId}&date=${date}`, { headers });
        if (!response.ok) {
          const err = await response.json();
          throw new Error(err.error || err.detail || `HTTP ${response.status}`);
        }
        const h = await response.json();
        console.log(`Hydration: ${h.total_ml || 0}/${h.goal_ml || 2500}ml`);
        if (h.records && h.records.length > 0) {
          h.records.forEach(r => console.log(`  ${r.amount_ml}ml at ${r.recorded_at}`));
        } else {
          console.log('  No records yet today.');
        }
      } catch (e) {
        console.error('Error:', e.message);
      }
    });

  nutritionHydration.command('add')
    .description('Record water intake')
    .requiredOption('--user-id <id>', 'User ID')
    .requiredOption('--amount <ml>', 'Amount in ml (e.g. 250 for a glass)')
    .option('--date <date>', 'Date (YYYY-MM-DD, default: today)')
    .action(async (opts) => {
      try {
        const client = await getClient();
        const orgId = client.activeOrgId;
        const headers = { ...client.headers, 'Content-Type': 'application/json' };
        if (orgId) headers['X-Zea-Org-Id'] = orgId;

        const body = {
          user_id: opts.userId,
          amount_ml: parseInt(opts.amount),
          recorded_at: opts.date
            ? `${opts.date}T${new Date().toTimeString().split(' ')[0]}`
            : new Date().toISOString()
        };

        const response = await zeaFetch(`${client.nutritionUrl || 'http://localhost:4085'}/nt/hydration`, {
          method: 'POST', headers, body: JSON.stringify(body)
        });
        if (!response.ok) {
          const err = await response.json();
          throw new Error(err.error || err.detail || `HTTP ${response.status}`);
        }
        const r = await response.json();
        console.log(`Water recorded: ${r.amount_ml}ml at ${r.recorded_at}`);
      } catch (e) {
        console.error('Error:', e.message);
      }
    });

  // ─── goals ──────────────────────────────────────────────────
  const nutritionGoals = nutrition.command('goals')
    .description('Nutrition goals management');

  nutritionGoals.command('get')
    .description('Get nutrition goals for a user')
    .requiredOption('--user-id <id>', 'User ID')
    .action(async (opts) => {
      try {
        const client = await getClient();
        const orgId = client.activeOrgId;
        const headers = { ...client.headers };
        if (orgId) headers['X-Zea-Org-Id'] = orgId;

        const response = await zeaFetch(`${client.nutritionUrl || 'http://localhost:4085'}/nt/goals?user_id=${opts.userId}`, { headers });
        if (!response.ok) {
          const err = await response.json();
          throw new Error(err.error || err.detail || `HTTP ${response.status}`);
        }
        const g = await response.json();
        console.log(`Goals for user ${opts.userId}:`);
        console.log(`  Diet type: ${g.diet_type || 'not set'}`);
        console.log(`  Target calories: ${g.target_calories || 'not set'} kcal`);
        console.log(`  Target proteins: ${g.target_proteins || 'not set'}g`);
        console.log(`  Target carbs: ${g.target_carbs || 'not set'}g`);
        console.log(`  Target fats: ${g.target_fats || 'not set'}g`);
      } catch (e) {
        console.error('Error:', e.message);
      }
    });

  nutritionGoals.command('set')
    .description('Set nutrition goals')
    .requiredOption('--user-id <id>', 'User ID')
    .option('--diet-type <type>', 'Diet type (lose_weight, maintain, gain_muscle, healthy, keto, vegetarian, vegan, gluten_free)')
    .option('--calories <kcal>', 'Daily calorie target')
    .option('--proteins <g>', 'Daily protein target in grams')
    .option('--carbs <g>', 'Daily carbs target in grams')
    .option('--fats <g>', 'Daily fats target in grams')
    .action(async (opts) => {
      try {
        const client = await getClient();
        const orgId = client.activeOrgId;
        const headers = { ...client.headers, 'Content-Type': 'application/json' };
        if (orgId) headers['X-Zea-Org-Id'] = orgId;

        const body = {};
        if (opts.dietType) body.diet_type = opts.dietType;
        if (opts.calories) body.target_calories = parseInt(opts.calories);
        if (opts.proteins) body.target_proteins = parseInt(opts.proteins);
        if (opts.carbs) body.target_carbs = parseInt(opts.carbs);
        if (opts.fats) body.target_fats = parseInt(opts.fats);

        const response = await zeaFetch(`${client.nutritionUrl || 'http://localhost:4085'}/nt/goals`, {
          method: 'PUT', headers, body: JSON.stringify(body)
        });
        if (!response.ok) {
          const err = await response.json();
          throw new Error(err.error || err.detail || `HTTP ${response.status}`);
        }
        const g = await response.json();
        console.log(`Goals updated:`);
        console.log(`  Diet: ${g.diet_type} | Calories: ${g.target_calories} kcal | P:${g.target_proteins}g C:${g.target_carbs}g F:${g.target_fats}g`);
      } catch (e) {
        console.error('Error:', e.message);
      }
    });

  // ─── subscription ───────────────────────────────────────────
  const nutritionSub = nutrition.command('subscription')
    .description('Subscription management');

  nutritionSub.command('status')
    .description('Show subscription status for a user')
    .requiredOption('--user-id <id>', 'User ID')
    .action(async (opts) => {
      try {
        const client = await getClient();
        const orgId = client.activeOrgId;
        const headers = { ...client.headers };
        if (orgId) headers['X-Zea-Org-Id'] = orgId;

        const response = await zeaFetch(`${client.nutritionUrl || 'http://localhost:4085'}/nt/subscriptions?user_id=${opts.userId}`, { headers });
        if (!response.ok) {
          const err = await response.json();
          throw new Error(err.error || err.detail || `HTTP ${response.status}`);
        }
        const s = await response.json();
        if (!s || !s.plan_type) {
          console.log('No active subscription.');
          return;
        }
        console.log(`Subscription: ${s.plan_type} [${s.status}]`);
        console.log(`  Start: ${s.start_date}`);
        console.log(`  End: ${s.end_date}`);
        if (s.days_remaining !== undefined) console.log(`  Days remaining: ${s.days_remaining}`);
      } catch (e) {
        console.error('Error:', e.message);
      }
    });

  nutritionSub.command('create')
    .description('Create a subscription')
    .requiredOption('--user-id <id>', 'User ID')
    .requiredOption('--plan <plan>', 'Plan type (monthly, annual)')
    .option('--start-date <date>', 'Start date (default: today)')
    .option('--end-date <date>', 'End date')
    .action(async (opts) => {
      try {
        const client = await getClient();
        const orgId = client.activeOrgId;
        const headers = { ...client.headers, 'Content-Type': 'application/json' };
        if (orgId) headers['X-Zea-Org-Id'] = orgId;

        const startDate = opts.startDate || new Date().toISOString().split('T')[0];
        let endDate = opts.endDate;
        if (!endDate) {
          const d = new Date(startDate);
          d.setMonth(d.getMonth() + (opts.plan === 'annual' ? 12 : 1));
          endDate = d.toISOString().split('T')[0];
        }

        const body = {
          user_id: opts.userId,
          plan_type: opts.plan,
          start_date: startDate,
          end_date: endDate
        };

        const response = await zeaFetch(`${client.nutritionUrl || 'http://localhost:4085'}/nt/subscriptions`, {
          method: 'POST', headers, body: JSON.stringify(body)
        });
        if (!response.ok) {
          const err = await response.json();
          throw new Error(err.error || err.detail || `HTTP ${response.status}`);
        }
        const s = await response.json();
        console.log(`Subscription created: ${s.plan_type} [${s.status}]`);
        console.log(`  ${s.start_date} → ${s.end_date}`);
      } catch (e) {
        console.error('Error:', e.message);
      }
    });

  nutritionSub.command('cancel <id>')
    .description('Cancel a subscription')
    .action(async (subId) => {
      try {
        const client = await getClient();
        const orgId = client.activeOrgId;
        const headers = { ...client.headers, 'Content-Type': 'application/json' };
        if (orgId) headers['X-Zea-Org-Id'] = orgId;

        const response = await zeaFetch(`${client.nutritionUrl || 'http://localhost:4085'}/nt/subscriptions/${subId}`, {
          method: 'PUT', headers, body: JSON.stringify({ status: 'cancelled' })
        });
        if (!response.ok) {
          const err = await response.json();
          throw new Error(err.error || err.detail || `HTTP ${response.status}`);
        }
        console.log(`Subscription ${subId} cancelled.`);
      } catch (e) {
        console.error('Error:', e.message);
      }
    });

  // ─── notifications ──────────────────────────────────────────
  const nutritionNotif = nutrition.command('notifications')
    .description('Notification settings');

  nutritionNotif.command('get')
    .description('Get notification settings')
    .requiredOption('--user-id <id>', 'User ID')
    .action(async (opts) => {
      try {
        const client = await getClient();
        const orgId = client.activeOrgId;
        const headers = { ...client.headers };
        if (orgId) headers['X-Zea-Org-Id'] = orgId;

        const response = await zeaFetch(`${client.nutritionUrl || 'http://localhost:4085'}/nt/notification-settings?user_id=${opts.userId}`, { headers });
        if (!response.ok) {
          const err = await response.json();
          throw new Error(err.error || err.detail || `HTTP ${response.status}`);
        }
        const n = await response.json();
        console.log('Notification settings:');
        console.log(`  Breakfast: ${n.breakfast_enabled ? 'ON' : 'OFF'}`);
        console.log(`  Lunch: ${n.lunch_enabled ? 'ON' : 'OFF'}`);
        console.log(`  Dinner: ${n.dinner_enabled ? 'ON' : 'OFF'}`);
      } catch (e) {
        console.error('Error:', e.message);
      }
    });

  nutritionNotif.command('update')
    .description('Update notification settings')
    .requiredOption('--user-id <id>', 'User ID')
    .option('--breakfast <on|off>', 'Enable/disable breakfast notification')
    .option('--lunch <on|off>', 'Enable/disable lunch notification')
    .option('--dinner <on|off>', 'Enable/disable dinner notification')
    .option('--all <on|off>', 'Enable/disable all notifications')
    .action(async (opts) => {
      try {
        const client = await getClient();
        const orgId = client.activeOrgId;
        const headers = { ...client.headers, 'Content-Type': 'application/json' };
        if (orgId) headers['X-Zea-Org-Id'] = orgId;

        const body = {};
        if (opts.breakfast) body.breakfast_enabled = opts.breakfast === 'on';
        if (opts.lunch) body.lunch_enabled = opts.lunch === 'on';
        if (opts.dinner) body.dinner_enabled = opts.dinner === 'on';
        if (opts.all) {
          const val = opts.all === 'on';
          body.breakfast_enabled = val;
          body.lunch_enabled = val;
          body.dinner_enabled = val;
        }

        const response = await zeaFetch(`${client.nutritionUrl || 'http://localhost:4085'}/nt/notification-settings`, {
          method: 'PUT', headers, body: JSON.stringify(body)
        });
        if (!response.ok) {
          const err = await response.json();
          throw new Error(err.error || err.detail || `HTTP ${response.status}`);
        }
        console.log('Notification settings updated.');
      } catch (e) {
        console.error('Error:', e.message);
      }
    });

  // ─── dashboard ──────────────────────────────────────────────
  nutrition.command('dashboard')
    .description('Show nutrition dashboard for a user')
    .requiredOption('--user-id <id>', 'User ID')
    .action(async (opts) => {
      try {
        const client = await getClient();
        const orgId = client.activeOrgId;
        const headers = { ...client.headers };
        if (orgId) headers['X-Zea-Org-Id'] = orgId;

        const response = await zeaFetch(
          `${client.nutritionUrl || 'http://localhost:4085'}/nt/dashboard?user_id=${opts.userId}`,
          { headers }
        );
        if (!response.ok) {
          const err = await response.json();
          throw new Error(err.error || err.detail || `HTTP ${response.status}`);
        }
        const result = await response.json();
        console.log(JSON.stringify(result, null, 2));
      } catch (e) {
        console.error('Error:', e.message);
      }
    });

  // ─── data ───────────────────────────────────────────────────
  const nutritionData = nutrition.command('data')
    .description('Database operations: add tables, seed data');

  nutritionData.command('add-table')
    .description('Create a new table in the Nutrition database (edits init-nutrition.sql + runs migration)')
    .requiredOption('--name <name>', 'Table name (e.g. food_catalog)')
    .requiredOption('--fields <json>', 'Fields as JSON array [{name, type, nullable, default, fk_table}]')
    .action(async (opts) => {
      try {
        const fields = JSON.parse(opts.fields);
        if (!Array.isArray(fields) || fields.length === 0) throw new Error('fields must be a non-empty JSON array');

        let cols = [];
        cols.push('  id UUID PRIMARY KEY DEFAULT gen_random_uuid()');
        cols.push('  organization_id UUID NOT NULL REFERENCES organizations(id)');
        for (const f of fields) {
          const ftype = f.type || 'VARCHAR(255)';
          let def = '  ' + f.name + ' ' + ftype;
          if (!f.nullable) def += ' NOT NULL';
          if (f.default) def += ' DEFAULT ' + f.default;
          if (f.fk_table) def += ' REFERENCES ' + f.fk_table + '(id)';
          cols.push(def);
        }
        cols.push('  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP');
        cols.push('  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP');

        const sql = `CREATE TABLE IF NOT EXISTS ${opts.name} (\n${cols.join(',\n')}\n);`;
        const rls = `ALTER TABLE ${opts.name} ENABLE ROW LEVEL SECURITY;
CREATE POLICY ${opts.name}_org_isolation ON ${opts.name}
  USING (organization_id = current_setting('app.current_organization_id')::uuid);`;

        console.log(`\nGenerated SQL:\n${sql}\n\n${rls}\n`);

        try {
          const dbResult = execSync(
            `docker exec zea_postgres_nutrition_local psql -U app_user -d nutrition_prod -c "${sql} ${rls}"`,
            { encoding: 'utf8', timeout: 10000 }
          );
          console.log(`✅ Table '${opts.name}' created in nutrition_prod`);
        } catch (e) {
          console.log(`⚠️  Could not apply to DB: ${e.message}`);
        }
        console.log(`\nNext: zea nutrition api add-endpoint --method GET --path "/nt/${opts.name}" --handler "list_${opts.name}"`);
      } catch (e) {
        console.error('Error:', e.message);
      }
    });

  // ─── api ────────────────────────────────────────────────────
  const nutritionApi = nutrition.command('api')
    .description('API operations: add endpoints');

  nutritionApi.command('add-endpoint')
    .description('Add a new API endpoint to nutrition-api')
    .requiredOption('--method <method>', 'HTTP method (GET, POST, PUT, DELETE)')
    .requiredOption('--path <path>', 'Route path (e.g. /nt/food-catalog)')
    .requiredOption('--handler <name>', 'Handler function name (e.g. list_food_catalog)')
    .action(async (opts) => {
      try {
        const method = opts.method.toUpperCase();
        const route = opts.path.startsWith('/') ? opts.path : `/${opts.path}`;
        const handler = opts.handler;
        const entity = opts.path.split('/').pop();
        const entityCamel = entity.charAt(0).toUpperCase() + entity.slice(1);

        const isList = method === 'GET';
        const controllerFn = isList
          ? `  def ${handler}(conn, _opts) do\n    case NT.List${entityCamel}.execute(nt_ctx(conn)) do\n      {:ok, items} -> json(conn, 200, items)\n      {:error, _} -> json(conn, 500, %{error: "internal_error"})\n    end\n  end`
          : method === 'POST'
          ? `  def ${handler}(conn, _opts) do\n    case NT.Create${entityCamel}.execute(nt_ctx(conn), conn.body_params) do\n      {:ok, item} -> json(conn, 201, item)\n      {:error, _} -> json(conn, 500, %{error: "internal_error"})\n    end\n  end`
          : `  def ${handler}(conn, _opts) do\n    json(conn, 200, %{endpoint: "${route}"})\n  end`;

        console.log(`\n${method} ${route} → ${handler}\n`);
        console.log(`Controller:\n${controllerFn}\n`);
        console.log(`\nAdd to router.ex:\n    ${method.toLowerCase()} "${route}", :${handler}`);
      } catch (e) {
        console.error('Error:', e.message);
      }
    });

  // ─── schema ─────────────────────────────────────────────────
  nutrition.command('schema')
    .description('Show current DB schema')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      try {
        if (opts.json) {
          const result = execSync(
            `docker exec zea_postgres_nutrition_local psql -U app_user -d nutrition_prod -c "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name;" --csv`,
            { encoding: 'utf8', timeout: 10000 }
          );
          console.log(result);
        } else {
          const result = execSync(
            `docker exec zea_postgres_nutrition_local psql -U app_user -d nutrition_prod -c "\\dt"`,
            { encoding: 'utf8', timeout: 10000 }
          );
          console.log(result);
        }
      } catch (e) {
        console.error('Error:', e.message);
      }
    });
}
