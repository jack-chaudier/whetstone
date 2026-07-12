const invitationTemplates = {
  make: [
    (c, last, minutes) => ({ action: `Make one imperfect move at the unfinished edge — ${milestoneClause(c)}.`, stopCondition: 'Stop when one character or element makes a choice you did not plan.', continuity: last, scopeMinutes: minutes }),
    (c, last, minutes) => ({ action: `Work only at the unfinished edge. For now: ${milestoneClause(c)}.`, stopCondition: `Stop before you are tempted to retreat into ${c.obstacle.toLowerCase()}.`, continuity: last, scopeMinutes: minutes }),
    (c, last, minutes) => ({ action: `Write one concrete beat, then leave the polish alone. The near horizon: ${milestoneClause(c)}.`, stopCondition: 'Stop after the first consequential turn.', continuity: last, scopeMinutes: minutes }),
    (c, last, minutes) => ({ action: `Return to the live edge and add 250 imperfect words — ${milestoneClause(c)}.`, stopCondition: 'Stop when the next decision becomes visible.', continuity: last, scopeMinutes: minutes }),
  ],
  learn: [
    (c, last, minutes) => ({ action: `Explain one part without looking anything up, then test it once — ${milestoneClause(c)}.`, stopCondition: 'Stop after you can name the exact point that still resists you.', continuity: last, scopeMinutes: minutes }),
    (c, last, minutes) => ({ action: `Retrieve the central idea, then solve one nearby example. The near horizon: ${milestoneClause(c)}.`, stopCondition: 'Stop after checking where your explanation and the result diverge.', continuity: last, scopeMinutes: minutes }),
    (c, last, minutes) => ({ action: `Make one prediction before opening your notes. For now: ${milestoneClause(c)}.`, stopCondition: 'Stop after revising the prediction in your own words.', continuity: last, scopeMinutes: minutes }),
    (c, last, minutes) => ({ action: `Teach the smallest difficult part to an imaginary skeptic — ${milestoneClause(c)}.`, stopCondition: 'Stop when the skeptic has one precise objection.', continuity: last, scopeMinutes: minutes }),
  ],
  investigate: [
    (c, last, minutes) => ({ action: `Inspect the source your current claim depends on most — ${milestoneClause(c)}.`, stopCondition: 'Stop after recording one claim, one piece of evidence, and one limitation.', continuity: last, scopeMinutes: minutes }),
    (c, last, minutes) => ({ action: `Write the strongest current claim, then try to weaken it honestly. The near horizon: ${milestoneClause(c)}.`, stopCondition: 'Stop when you can name what evidence would change your mind.', continuity: last, scopeMinutes: minutes }),
    (c, last, minutes) => ({ action: `Compare two pieces of evidence directly. For now: ${milestoneClause(c)}.`, stopCondition: 'Stop after identifying the disagreement that matters.', continuity: last, scopeMinutes: minutes }),
    (c, last, minutes) => ({ action: `Replace one summary-dependent claim with a source-grounded note — ${milestoneClause(c)}.`, stopCondition: 'Stop after marking what you inspected yourself.', continuity: last, scopeMinutes: minutes }),
  ],
};

function milestoneClause(covenant) {
  return covenant.milestone.replace(/[.!?]+$/, '');
}

function lastContinuity(project) {
  const last = [...project.sessions].filter((s) => s.endedAt).sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
  if (!last) return `You already have ${project.covenant.existing.toLowerCase()}`;
  if (last.reentry) return `You left yourself a way back in: “${last.reentry}”`;
  if (last.reflection?.changed) return `Last time, ${last.reflection.changed.charAt(0).toLowerCase()}${last.reflection.changed.slice(1)}`;
  return 'The work is still exactly where you left it.';
}

export class ScriptedCoachProvider {
  async generateInvitation(project, ctx) {
    const c = project.covenant;
    const index = project.invitations.length % invitationTemplates[c.shape].length;
    const draft = invitationTemplates[c.shape][index](c, lastContinuity(project), c.schedule.minutes);
    if (!ctx.missedLastScheduled) return draft;
    const recovery = {
      make: 'Read the last two hundred words. Mark the sentence where you would re-enter. Add nothing yet.',
      learn: 'Explain the last idea informally, without solving anything. Mark the first uncertainty.',
      investigate: 'Reopen the most consequential source. Mark one passage that still bears weight.',
    };
    return { ...draft, action: recovery[c.shape], stopCondition: 'Stop once contact with the work feels specific again.', scopeMinutes: 10 };
  }

  async assist(project, session, ask, level) {
    const owned = project.covenant.humanOwned.join(' and ');
    if (/(?:\b(?:draft|compose|continue|complete|finish|rewrite|translate|write|solve)\b.{0,80}\b(?:prose|scene|paragraph|dialogue|answer|solution|essay|draft|story|it|this|that|mine|my)\b|\b(?:do|write|finish|answer|solve)\s+(?:it|this|that)\s+for\s+me\b|\b(?:give|provide)\s+me\s+(?:the\s+)?(?:answer|solution|paragraph|dialogue|essay)\b|(?:翻译|续写|改写|代写|帮我写|替我写|帮我做))/iu.test(ask)) {
      return `You asked me not to take over ${owned}. What is the smallest choice in front of you that only you can make?`;
    }
    const subject = ask.trim() || session.reentry || project.covenant.milestone;
    if (level === 'nudge') return `Stay with the live edge: ${subject}. Make one move before you evaluate it.`;
    if (level === 'question') return project.covenant.shape === 'make'
      ? 'What does the person in this moment want to prevent the other from noticing?'
      : project.covenant.shape === 'learn'
        ? 'What would you predict before checking the rule or source?'
        : 'Which part of this claim would survive if your strongest source disappeared?';
    const options = project.covenant.shape === 'make'
      ? ['increase the cost of silence', 'let the wrong inference stand', 'make the next action contradict the stated intention']
      : project.covenant.shape === 'learn'
        ? ['retrieve before reviewing', 'test one boundary case', 'explain the gap in ordinary language']
        : ['challenge the measure', 'look for disconfirming evidence', 'narrow the claim to what the source can carry'];
    return `Three directions, not finished work: ${options.map((item, i) => `${i + 1}) ${item}`).join('; ')}.`;
  }

  async closeoutQuestion(project, session) {
    return session.wordsProduced > 0
      ? 'What became true in the work that was not true when you began?'
      : `You kept contact with ${project.covenant.ambition.toLowerCase()}. Where is the cleanest re-entry point?`;
  }
}
