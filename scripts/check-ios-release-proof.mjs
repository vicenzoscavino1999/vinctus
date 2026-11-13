import fs from 'node:fs';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const repository = process.env.GITHUB_REPOSITORY;
const runID = process.env.VINCTUS_VALIDATED_TEST_RUN;
if (!repository || !/^\d+$/.test(runID ?? '')) {
  throw new Error('A repository and numeric native test run ID are required.');
}

function command(program, args) {
  const result = spawnSync(program, args, { encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) throw new Error(`Evidence verification failed: ${program} ${args[0]}`);
  return result.stdout.trim();
}

const proof = JSON.parse(command('gh', ['api', `repos/${repository}/actions/runs/${runID}`]));
if (
  proof.repository.full_name !== repository ||
  proof.path !== '.github/workflows/ios-native.yml' ||
  proof.status !== 'completed' ||
  !['push', 'workflow_dispatch'].includes(proof.event) ||
  !/^[a-f0-9]{40}$/.test(proof.head_sha)
) {
  throw new Error(
    'The evidence must be a completed native workflow on this repository and an exact source commit.',
  );
}
const jobs = JSON.parse(
  command('gh', [
    'api',
    `repos/${repository}/actions/runs/${runID}/jobs?filter=latest&per_page=100`,
  ]),
);
if (jobs.total_count !== jobs.jobs.length) throw new Error('Incomplete native job evidence.');
for (const name of ['ios-native', 'ios-native-integration']) {
  const matches = jobs.jobs.filter((job) => job.name === name);
  if (
    matches.length !== 1 ||
    matches[0].status !== 'completed' ||
    matches[0].conclusion !== 'success'
  ) {
    throw new Error(`Native evidence is not approved: ${name}`);
  }
}

command('git', ['merge-base', '--is-ancestor', proof.head_sha, 'HEAD']);
command('git', [
  'diff',
  '--quiet',
  proof.head_sha,
  '--',
  'ios-native',
  'shared',
  'firebase.json',
  'firestore.rules',
  'firestore.indexes.json',
  'storage.rules',
  '.nvmrc',
]);

function jobDefinition(workflow, name) {
  const normalized = workflow.replace(/\r\n/g, '\n');
  const start = normalized.indexOf(`\n  ${name}:\n`);
  if (start < 0) throw new Error(`Missing native workflow job: ${name}`);
  const remainder = normalized.slice(start + 1);
  const nextJob = remainder.slice(1).search(/^  [a-zA-Z0-9_-]+:\s*$/m);
  const section = nextJob < 0 ? remainder : remainder.slice(0, nextJob + 1);
  // Only the job scheduling condition differs in the optional evidence-reuse mode.
  return section.replace(/^    if: [^\n]*\n/gm, '').trim();
}
const oldWorkflow = command('git', ['show', `${proof.head_sha}:.github/workflows/ios-native.yml`]);
const currentWorkflow = fs.readFileSync('.github/workflows/ios-native.yml', 'utf8');
for (const name of ['build', 'integration']) {
  if (jobDefinition(oldWorkflow, name) !== jobDefinition(currentWorkflow, name)) {
    throw new Error(
      `Native test definition changed: ${name}; run the full native workflow instead.`,
    );
  }
}
console.log(`Native source and test definitions match approved run ${runID} at ${proof.head_sha}.`);
