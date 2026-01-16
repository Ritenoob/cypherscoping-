/**
 * Agent Tests
 */
const { AgentBase } = require('../agents/agent-base');

class TestAgent extends AgentBase {
  constructor() {
    super({ id: 'test-agent', name: 'Test Agent' });
  }
  
  async processTask(task) {
    return { ok: true, value: task };
  }
}

async function run() {
  let passed = 0;
  let failed = 0;

  // Test 1: Agent initialization
  try {
    const agent = new TestAgent();
    console.log('✓ Agent initialization');
    passed++;
  } catch (e) {
    console.log('✗ Agent initialization:', e.message);
    failed++;
  }

  // Test 2: Task queue
  try {
    const agent = new TestAgent();
    const result = agent.enqueue({ type: 'TEST' });
    if (result.ok) {
      console.log('✓ Task enqueue');
      passed++;
    } else {
      throw new Error(result.error.message);
    }
  } catch (e) {
    console.log('✗ Task enqueue:', e.message);
    failed++;
  }

  // Test 3: Message creation
  try {
    const agent = new TestAgent();
    const msg = agent.createMessage('other-agent', 'TEST_ACTION', { data: 1 });
    if (msg.from === 'test-agent' && msg.to === 'other-agent') {
      console.log('✓ Message creation');
      passed++;
    } else {
      throw new Error('Invalid message format');
    }
  } catch (e) {
    console.log('✗ Message creation:', e.message);
    failed++;
  }

  return { passed, failed };
}

module.exports = { run };
