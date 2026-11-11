export const meta = {
  name: 'council-mode',
  description: 'Advocates argue each option with evidence, debate under a blind referee, and a 7-persona panel ranks the options',
  whenToUse: 'Only from the council-mode:council skill, after the user approves the problem statement and the panel',
  phases: [
    { title: 'Generate', detail: 'parallel option generators, then one merge' },
    { title: 'Research', detail: 'one advocate per option builds an evidence-labeled case' },
    { title: 'Challenge', detail: 'round 1: every advocate challenges its rivals at the same time' },
    { title: 'Referee', detail: 'reject challenges without evidence, strip the tone' },
    { title: 'Reply', detail: 'round 2: every advocate answers every challenge at the same time' },
    { title: 'Rule', detail: 'blind referee rulings on disputed claims' },
    { title: 'Vote', detail: 'the frozen panel ranks the options from the dossier' },
  ],
}

// --- pure helpers start
const LABEL_LETTERS = ['B', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'M', 'N', 'P', 'Q', 'S', 'T', 'V', 'Y', 'Z']
// --- pure helpers end

return { stopped: 'orchestration not implemented yet' }
