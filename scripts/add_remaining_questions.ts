import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

function loadLocalEnv(relativeFilePath: string) {
  try {
    const fullPath = path.resolve(process.cwd(), relativeFilePath);
    if (!fs.existsSync(fullPath)) return;
    const content = fs.readFileSync(fullPath, 'utf8');
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eqIndex = line.indexOf('=');
      if (eqIndex === -1) continue;
      const key = line.slice(0, eqIndex).trim();
      let val = line.slice(eqIndex + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  } catch (e) {
    console.error('Error loading env:', e);
  }
}

loadLocalEnv('.env.local');

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error('Missing Supabase URL or Service Role Key in environment');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export interface QuestionDef {
  question_number: number;
  question_text: string;
  description: string;
  is_active: boolean;
}

export const REMAINING_QUESTIONS_21_TO_72: QuestionDef[] = [
  {
    question_number: 21,
    question_text: 'Who is the Late Legend?',
    description: 'Late-ah varradhula consistency maintain panra legend!',
    is_active: true,
  },
  {
    question_number: 22,
    question_text: 'Who is the Leave Maharaja?',
    description: 'Leave poduradhukku reason thevai illa, opportunity podhum!',
    is_active: true,
  },
  {
    question_number: 23,
    question_text: 'Who is the Panic Panda?',
    description: 'Chinna problem vandhaalum mind-la emergency meeting nadakkum!',
    is_active: true,
  },
  {
    question_number: 24,
    question_text: 'Who is the Mission Tomorrow?',
    description: 'Innaikku panna vendiya velai ellam naalaikku shift aagum!',
    is_active: true,
  },
  {
    question_number: 25,
    question_text: 'Who is the Slow Motion?',
    description: 'Ellarum finish panniduvaanga, ivar mattum relaxed-ah start pannuvaar!',
    is_active: true,
  },
  {
    question_number: 26,
    question_text: 'Who is the Break Boss?',
    description: 'Work vida break-ku dhaan ivaroda priority adhigam!',
    is_active: true,
  },
  {
    question_number: 27,
    question_text: 'Who is the Vaai FM?',
    description: 'Radio madhiri nonstop-ah pesitte iruppaar!',
    is_active: true,
  },
  {
    question_number: 28,
    question_text: 'Who is the Story Sultan?',
    description: 'Oru chinna incident-aiye full-length story-ah solluvaar!',
    is_active: true,
  },
  {
    question_number: 29,
    question_text: 'Who is the Info Inspector?',
    description: 'Oru update miss aanaalum investigate panni kandupidichiduvaan!',
    is_active: true,
  },
  {
    question_number: 30,
    question_text: 'Who is the Bill Breaker?',
    description: 'Bill varumbodhu mattum wallet romba silent-ah aagidum!',
    is_active: true,
  },
  {
    question_number: 31,
    question_text: 'Who is the Food Radar?',
    description: 'Food enga irundhaalum ivaroda radar kandupidichidum!',
    is_active: true,
  },
  {
    question_number: 32,
    question_text: 'Who is the Boss Baby?',
    description: 'Size edhuva irundhaalum attitude mattum boss level!',
    is_active: true,
  },
  {
    question_number: 33,
    question_text: 'Who is the Pending Prince/Princess?',
    description: 'Ella velaiyum pending-la irukkum, aana confidence mattum permanent!',
    is_active: true,
  },
  {
    question_number: 34,
    question_text: 'Who is the Tech Thala?',
    description: 'Tech problem vandha ellarum ivarai dhaan theduvaanga!',
    is_active: true,
  },
  {
    question_number: 35,
    question_text: 'Who is the Code Kolaru?',
    description: 'Code run aagudha illaya theriyadhu, errors mattum guaranteed!',
    is_active: true,
  },
  {
    question_number: 36,
    question_text: 'Who is the Git Ghost?',
    description: 'Commit pannumbodhu active, merge conflict vandha missing!',
    is_active: true,
  },
  {
    question_number: 37,
    question_text: 'Who is the Mark Merchant?',
    description: 'Marks collect panradhula smart-ah strategy poduvaar!',
    is_active: true,
  },
  {
    question_number: 38,
    question_text: 'Who is the Bunk Bhai?',
    description: 'Class-ku leave, friends kooda outing-ku full attendance!',
    is_active: true,
  },
  {
    question_number: 39,
    question_text: 'Who is the Silent Strategist?',
    description: 'Adhigama pesa maattaar, aana mind-la full plan ready!',
    is_active: true,
  },
  {
    question_number: 40,
    question_text: 'Who is the Confusion Kumar?',
    description: 'Clear-ah explain panninaalum last-la confusion create panniduvaar!',
    is_active: true,
  },
  {
    question_number: 41,
    question_text: 'Who is the Unpredictable?',
    description: 'Next enna pannuvaar-nu avarukkum theriyadhu, namakkum theriyadhu!',
    is_active: true,
  },
  {
    question_number: 42,
    question_text: 'Who is the Multitasking Machine?',
    description: 'Ore time-la pala velai seivaar, edhu mudinjadhu-nu mattum theriyadhu!',
    is_active: true,
  },
  {
    question_number: 43,
    question_text: 'Who is the Over Planner?',
    description: 'Plan A mudiyuradhukulla Plan Z varaikkum ready panniduvaanga!',
    is_active: true,
  },
  {
    question_number: 44,
    question_text: 'Who is the Luxury Lover?',
    description: 'Budget student life-la kooda premium lifestyle kanavu!',
    is_active: true,
  },
  {
    question_number: 45,
    question_text: 'Who is the Last Minute Olapal?',
    description: 'Deadline nerungina dhaan ivaroda real performance start aagum!',
    is_active: true,
  },
  {
    question_number: 46,
    question_text: 'Who is the Mystery Man?',
    description: 'Ivaroda next move-ai predict panradhu impossible!',
    is_active: true,
  },
  {
    question_number: 47,
    question_text: 'Who is the Kudumbasthan?',
    description: 'Friends gang-layum family responsibility mode-la iruppaar!',
    is_active: true,
  },
  {
    question_number: 48,
    question_text: 'Who is the Local Sherlock?',
    description: 'Chinna clue kidaichaalum full investigation start panniduvaan!',
    is_active: true,
  },
  {
    question_number: 49,
    question_text: 'Who is the Bond Builder?',
    description: 'Different people-aiyum easy-ah connect panni friendship create pannuvaar!',
    is_active: true,
  },
  {
    question_number: 50,
    question_text: 'Who is the Medal Pedal?',
    description: 'Competition vandha podhum, medal vaangura varaikkum vida maattaar!',
    is_active: true,
  },
  {
    question_number: 51,
    question_text: 'Who is the Assault Aarumugam?',
    description: 'Entry mattum mass, dialogue mattum local level!',
    is_active: true,
  },
  {
    question_number: 52,
    question_text: 'Who is the Navarasam?',
    description: 'Ore naal-la nine emotions-aiyum live-ah kaattiduvaanga!',
    is_active: true,
  },
  {
    question_number: 53,
    question_text: 'Who is the Spy Thambi?',
    description: 'Yaar enna pannanga-nu secret-ah track pannitte iruppaan!',
    is_active: true,
  },
  {
    question_number: 54,
    question_text: 'Who is the Gaming Ghost?',
    description: 'Game start aana podhum, real world-la irundhu disappear aagiduvaar!',
    is_active: true,
  },
  {
    question_number: 55,
    question_text: 'Who is the Frame Finder?',
    description: 'Ella moment-layum perfect shot thedi kandupidippaar!',
    is_active: true,
  },
  {
    question_number: 56,
    question_text: 'Who is the Decision Pending?',
    description: 'Enna choose panradhu-nu yosichitte iruppaar, decision mattum varadhu!',
    is_active: true,
  },
  {
    question_number: 57,
    question_text: 'Who is the Okay Machine?',
    description: 'Endha plan sonnaalum ore reply, "Okay bro!"',
    is_active: true,
  },
  {
    question_number: 58,
    question_text: 'Who is the Nonstop Nelson?',
    description: 'Pesuradhukku start button irukku, stop button mattum illa!',
    is_active: true,
  },
  {
    question_number: 59,
    question_text: 'Who is the Mixture Machi?',
    description: 'Konjam comedy, konjam attitude, konjam madness, full package!',
    is_active: true,
  },
  {
    question_number: 60,
    question_text: 'Who is the Silent Signal?',
    description: 'Vaaya thirandhu pesa maattaar, aana expressions-la ellam solliduvaanga!',
    is_active: true,
  },
  {
    question_number: 61,
    question_text: 'Who is the Side Character?',
    description: 'Main scene-la irukka maattaar, aana ovvoru episode-layum kandippa iruppaar!',
    is_active: true,
  },
  {
    question_number: 62,
    question_text: 'Who is the Universal Entry?',
    description: 'Endha group-layum easy-ah mix aagi own person aagiduvaar!',
    is_active: true,
  },
  {
    question_number: 63,
    question_text: 'Who is the Cinema Citizen?',
    description: 'Life-la nadakkura ovvoru situation-kum oru movie reference ready!',
    is_active: true,
  },
  {
    question_number: 64,
    question_text: 'Who is the Ring Raja?',
    description: 'Phone ring aana podhum, yaar irundhaalum call dhaan first priority!',
    is_active: true,
  },
  {
    question_number: 65,
    question_text: 'Who is the Scene Setter?',
    description: 'Normal moment-aiyum unforgettable scene-ah maathiduvaan!',
    is_active: true,
  },
  {
    question_number: 66,
    question_text: 'Who is the Always Available?',
    description: 'Help ketta udane varuvaar, aana avarai thedumbodhu busy-ah iruppaar!',
    is_active: true,
  },
  {
    question_number: 67,
    question_text: 'Who is the Shadow Shout?',
    description: 'Background-la irundhaalum ivaroda voice mattum front row-la irukkum!',
    is_active: true,
  },
  {
    question_number: 68,
    question_text: 'Who is the Hidden Camera?',
    description: 'Yaarum notice pannaadha moments-ai kooda ivar miss panna maattaar!',
    is_active: true,
  },
  {
    question_number: 69,
    question_text: 'Who is the Solo Superstar?',
    description: 'Thaniya irundhaalum full confidence, crowd-la irundhaalum same stardom!',
    is_active: true,
  },
  {
    question_number: 70,
    question_text: 'Who is the Flexible Fellow?',
    description: 'Plan edhuva irundhaalum adjust panni enjoy panniduvaan!',
    is_active: true,
  },
  {
    question_number: 71,
    question_text: 'Who is the Vandhuten Voice?',
    description: 'Ivar varradhukku munnadiye ivaroda voice vandhu attendance podum!',
    is_active: true,
  },
  {
    question_number: 72,
    question_text: 'Who is the Thani Track?',
    description: 'Ellarum oru pakkam ponaalum, ivarukku thani route dhaan!',
    is_active: true,
  },
];

async function addRemainingQuestions() {
  console.log('--- Step 1: Inspecting live database ---');
  const { data: existingQuestions, error: fetchErr } = await supabase
    .from('questions')
    .select('*')
    .order('question_number', { ascending: true });

  if (fetchErr) {
    console.error('Failed to query questions table:', fetchErr);
    process.exit(1);
  }

  const countBefore = existingQuestions.length;
  console.log(`Live questions count before insertion: ${countBefore}`);

  // Map existing by number and text
  const existingNumbers = new Set(existingQuestions.map((q) => q.question_number));
  const existingTexts = new Set(
    existingQuestions.map((q) => q.question_text.trim().toLowerCase())
  );

  // Preserve 1-20
  console.log('Preserving questions 1 to 20:');
  const q1to20 = existingQuestions.filter((q) => q.question_number <= 20);
  console.log(`Verified ${q1to20.length} questions in range 1-20.`);

  const toInsert: QuestionDef[] = [];
  const skippedDuplicates: { question_number: number; reason: string }[] = [];

  for (const q of REMAINING_QUESTIONS_21_TO_72) {
    if (existingNumbers.has(q.question_number)) {
      skippedDuplicates.push({
        question_number: q.question_number,
        reason: `Question number #${q.question_number} already exists in database.`,
      });
      continue;
    }
    if (existingTexts.has(q.question_text.trim().toLowerCase())) {
      skippedDuplicates.push({
        question_number: q.question_number,
        reason: `Question text "${q.question_text}" already exists in database.`,
      });
      continue;
    }
    toInsert.push(q);
  }

  console.log(`Found ${toInsert.length} questions to insert, ${skippedDuplicates.length} duplicates skipped.`);

  if (skippedDuplicates.length > 0) {
    console.log('Skipped duplicate details:', JSON.stringify(skippedDuplicates, null, 2));
  }

  if (toInsert.length > 0) {
    console.log('\n--- Step 2: Inserting questions 21 to 72 into Supabase ---');
    const { data: insertedData, error: insertErr } = await supabase
      .from('questions')
      .insert(toInsert)
      .select();

    if (insertErr) {
      console.error('Failed to insert questions:', insertErr);
      process.exit(1);
    }
    console.log(`Successfully inserted ${insertedData?.length || 0} questions.`);
  } else {
    console.log('No new questions to insert.');
  }

  console.log('\n--- Step 3: Verifying final state ---');
  const { data: finalQuestions, error: finalErr } = await supabase
    .from('questions')
    .select('*')
    .order('question_number', { ascending: true });

  if (finalErr) {
    console.error('Failed to query final questions state:', finalErr);
    process.exit(1);
  }

  const countAfter = finalQuestions.length;
  console.log(`Live questions count after insertion: ${countAfter}`);

  // Validation checks
  const missingNumbers: number[] = [];
  const duplicateNumbers: number[] = [];
  const seenNumbers = new Set<number>();

  for (let i = 1; i <= 72; i++) {
    const found = finalQuestions.filter((q) => q.question_number === i);
    if (found.length === 0) {
      missingNumbers.push(i);
    } else if (found.length > 1) {
      duplicateNumbers.push(i);
    }
  }

  console.log(`Questions range check: 1 to 72`);
  console.log(`Missing question numbers: ${missingNumbers.length > 0 ? missingNumbers.join(', ') : 'None'}`);
  console.log(`Duplicate question numbers: ${duplicateNumbers.length > 0 ? duplicateNumbers.join(', ') : 'None'}`);

  // Verify all 72 are active
  const inactiveCount = finalQuestions.filter((q) => !q.is_active).length;
  console.log(`Active questions count: ${finalQuestions.filter((q) => q.is_active).length} / ${countAfter}`);
  console.log(`Inactive questions count: ${inactiveCount}`);

  // Verify Q1-20 still match original
  let q1to20Preserved = true;
  for (const originalQ of q1to20) {
    const matched = finalQuestions.find((q) => q.id === originalQ.id);
    if (!matched || matched.question_text !== originalQ.question_text || matched.description !== originalQ.description) {
      q1to20Preserved = false;
      console.error(`Mismatch on Q${originalQ.question_number}!`);
    }
  }
  console.log(`Questions 1-20 preserved exactly: ${q1to20Preserved}`);

  // Verify Q21-72 match provided text and description
  let q21to72Matched = true;
  for (const expected of REMAINING_QUESTIONS_21_TO_72) {
    const live = finalQuestions.find((q) => q.question_number === expected.question_number);
    if (!live) {
      console.error(`Missing Q${expected.question_number}`);
      q21to72Matched = false;
    } else if (live.question_text !== expected.question_text || live.description !== expected.description) {
      console.error(`Mismatch on Q${expected.question_number}:`);
      console.error(`  Expected: "${expected.question_text}" | "${expected.description}"`);
      console.error(`  Actual:   "${live.question_text}" | "${live.description}"`);
      q21to72Matched = false;
    }
  }
  console.log(`Questions 21-72 match provided text and descriptions: ${q21to72Matched}`);

  return {
    countBefore,
    countAfter,
    insertedCount: toInsert.length,
    skippedDuplicates,
    success: missingNumbers.length === 0 && duplicateNumbers.length === 0 && q1to20Preserved && q21to72Matched,
  };
}

addRemainingQuestions()
  .then((res) => {
    console.log('\n--- Script Execution Summary ---');
    console.log(JSON.stringify(res, null, 2));
    if (!res.success) {
      process.exit(1);
    }
  })
  .catch((err) => {
    console.error('Fatal error during execution:', err);
    process.exit(1);
  });
