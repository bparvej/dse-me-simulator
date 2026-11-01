// Script to parse extracted sheet text files into a structured JSON file of all DSE Certification Test Cases
const fs = require('fs');
const path = require('path');

const docsDir = path.resolve(__dirname, '..', 'docs');
const outPath = path.resolve(__dirname, '..', 'src', 'config', 'dse-certification-cases.json');

const files = [
  { file: 'sheet2_SessionTransport.txt', category: 'SessionTransport', prefix: 'S' },
  { file: 'sheet3_MarketOrders.txt', category: 'MarketOrders', prefix: 'M' },
  { file: 'sheet4_LimitOrders.txt', category: 'LimitOrders', prefix: 'L' },
  { file: 'sheet5_BlockOrders.txt', category: 'BlockOrders', prefix: 'B' },
  { file: 'sheet6_Misc.txt', category: 'Misc', prefix: 'Z' }
];

const allCases = [];

for (const { file, category, prefix } of files) {
  const filePath = path.join(docsDir, file);
  if (!fs.existsSync(filePath)) continue;

  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');

  let currentCase = null;
  let currentStep = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Detect test case header e.g. A16: tS1 | B16: DESCRIPTION: First Logon... | G16: tCRITICAL / STOP ON FAIL
    const caseMatch = line.match(/(?:A\d+:)?\s*t?([SMLBZ]\d+)\b[^|]*\|\s*(?:B\d+:)?\s*(?:DESCRIPTION:)?\s*([^|]+)(?:\|\s*([GH]\d+:)?\s*t?(CRITICAL[^\n|]*|IMPORTANT[^\n|]*|OPTIONAL[^\n|]*))?/i);
    
    // Check if line starts a new case definition
    if (caseMatch && (line.includes('DESCRIPTION:') || line.includes('STOP ON FAIL') || line.includes('CONTINUE ON FAIL'))) {
      const caseId = caseMatch[1].trim();
      const description = caseMatch[2].replace(/^DESCRIPTION:\s*/i, '').trim();
      let importance = 'IMPORTANT';
      if (line.includes('CRITICAL')) importance = 'CRITICAL / STOP ON FAIL';
      else if (line.includes('OPTIONAL')) importance = 'OPTIONAL / CONTINUE ON FAIL';
      else if (line.includes('IMPORTANT')) importance = 'IMPORTANT / CONTINUE ON FAIL';

      currentCase = {
        id: caseId,
        category,
        description,
        importance,
        preconditions: [],
        steps: []
      };
      allCases.push(currentCase);
      continue;
    }

    if (!currentCase) continue;

    // Collect preconditions if step header hasn't arrived
    if (currentCase.steps.length === 0 && !line.includes('Step #')) {
      if (line.includes('Session is connected') || line.includes('Market is open') || line.includes('Account')) {
        const precondText = line.split('|').map(s => s.replace(/[A-Z]\d+:\s*/, '').trim()).filter(Boolean).join('; ');
        if (!currentCase.preconditions.includes(precondText)) {
          currentCase.preconditions.push(precondText);
        }
      }
    }

    // Step rows e.g. Row 20 | A20: 1.0 | B20: Broker initiates logon... | C20: Inbound | D20: ...
    const stepMatch = line.match(/(?:A\d+:)?\s*(\d+(?:\.\d+)?)\s*\|\s*(?:B\d+:)?\s*([^|]+)\|\s*(?:(?:C\d+:)?\s*([^|]+)\|)?\s*(?:(?:D\d+:)?\s*([^|]+)\|)?/);
    if (stepMatch && !line.includes('Step #') && !line.includes('Case ID')) {
      const stepNum = parseFloat(stepMatch[1]);
      if (!isNaN(stepNum)) {
        const stepDesc = (stepMatch[2] || '').trim();
        let direction = 'Internal';
        let expectedResult = '';
        let sampleFix = '';

        // Extract direction, expected result, sample FIX
        const parts = line.split('|').map(p => p.trim());
        for (const p of parts) {
          if (p.includes('Inbound/Outbound')) direction = 'Inbound/Outbound';
          else if (p.includes('Inbound')) direction = 'Inbound';
          else if (p.includes('Outbound')) direction = 'Outbound';
          
          if (p.includes('8=FIXT.1.1') || p.includes('35=')) {
            const cleanFix = p.replace(/^[A-Z]\d+:\s*/, '').trim();
            if (cleanFix) sampleFix = cleanFix;
          }
        }

        // Expected result extraction
        for (const p of parts) {
          const cleanP = p.replace(/^[A-Z]\d+:\s*/, '').trim();
          if (cleanP.startsWith('DSE replies') || cleanP.startsWith('FIX Logon') || cleanP.startsWith('Broker sends') || cleanP.startsWith('DSE sends') || cleanP.startsWith('DSE rejects') || cleanP.startsWith('DSE accepts') || cleanP.startsWith('Order is') || cleanP.startsWith('Verify')) {
            expectedResult = cleanP;
            break;
          }
        }

        currentCase.steps.push({
          stepNumber: stepNum,
          description: stepDesc,
          direction,
          expectedResult,
          sampleFix: sampleFix || null
        });
      }
    }
  }
}

// Ensure directory exists
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(allCases, null, 2), 'utf8');

console.log(`Successfully compiled ${allCases.length} DSE Certification Test Cases to ${outPath}`);
