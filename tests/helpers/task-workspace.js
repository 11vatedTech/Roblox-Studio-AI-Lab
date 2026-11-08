import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export async function makeTaskWorkspace() {
  const root = path.join(repositoryRoot, '.lab-runtime', `task-execution-test-${randomUUID()}`);
  await fs.mkdir(path.join(root, 'projects', 'test-world'), { recursive: true });
  const sourceRegistry = JSON.parse(await fs.readFile(path.join(repositoryRoot, 'docs', 'game-intelligence', 'specialists', 'registry.json'), 'utf8'));
  const ownerId = 'specialist.game-design-director';
  const gameplayEngineerId = 'specialist.gameplay-engineer';
  const reviewerId = 'specialist.qa-director';
  const specialists = sourceRegistry.specialists.filter((item) => [ownerId, gameplayEngineerId, reviewerId].includes(item.id));
  specialists.find((item) => item.id === ownerId).independentReviewerIds = [reviewerId];
  specialists.find((item) => item.id === gameplayEngineerId).independentReviewerIds = [reviewerId];
  specialists.find((item) => item.id === reviewerId).independentReviewerIds = [ownerId, gameplayEngineerId];
  const reviewer = specialists.find((item) => item.id === reviewerId);
  reviewer.inputArtifactTypes = [...new Set([...reviewer.inputArtifactTypes, 'gameplay-module'])];
  sourceRegistry.specialists = specialists;
  const registryPath = path.join(root, 'docs', 'game-intelligence', 'specialists', 'registry.json');
  await fs.mkdir(path.dirname(registryPath), { recursive: true });
  await fs.writeFile(registryPath, `${JSON.stringify(sourceRegistry, null, 2)}\n`);

  for (const specialist of specialists) {
    const sourcePath = path.join(repositoryRoot, ...specialist.contractPath.split('/'));
    const targetPath = path.join(root, ...specialist.contractPath.split('/'));
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, await fs.readFile(sourcePath, 'utf8'));
  }
  const sourceRecord = path.join(repositoryRoot, 'docs', 'game-intelligence', 'records', 'mechanics', 'mechanic.tactical-card-combat.json');
  const targetRecord = path.join(root, 'docs', 'game-intelligence', 'records', 'mechanics', 'mechanic.tactical-card-combat.json');
  await fs.mkdir(path.dirname(targetRecord), { recursive: true });
  await fs.writeFile(targetRecord, await fs.readFile(sourceRecord, 'utf8'));
  return root;
}

export async function removeTaskWorkspace(root) {
  await fs.rm(root, { recursive: true, force: true }).catch(() => {});
}

export function makeTaskRequest({ path: outputPath = 'docs/combat.md', title = 'Specify tactical combat' } = {}) {
  return {
    project: 'test-world',
    brief: { title: 'Tactical combat study', summary: 'Specify a server-owned tactical card combat loop for a Roblox prototype.' },
    tasks: [{
      title,
      description: 'Define turn ownership, legal actions, card effects, resolution, and recovery states.',
      capabilityIds: ['mechanic.combat'],
      knowledgeIds: ['mechanic.tactical-card-combat'],
      inputArtifactTypes: [],
      outputArtifactTypes: ['design-risk-register'],
      fileOwnership: [{ path: outputPath, mode: 'write' }],
      dependsOn: [],
    }],
  };
}
