import type { Mood } from '../../core/state';

/** What the character says. `owner` is the player's display name; the bubble is labeled with the character's name. */
export const moodReplies: Readonly<Record<Mood, ReadonlyArray<(owner: string) => string>>> = {
  great: [
    (o) => `Que alegria, ${o}! Vou dar um pulinho de felicidade!`,
    (o) => `Dia ótimo! Com você assim, ${o}, a montanha parece pequena.`,
  ],
  good: [
    (o) => `Que bom, ${o}! Vamos subir mais um pouquinho hoje?`,
    () => 'Gostei de ver! Passinho a passinho a gente chega lá.',
  ],
  okay: [
    () => 'Dias normais também contam. Estou aqui com você.',
    (o) => `Tudo bem, ${o}. Uma metinha pequena já faz diferença.`,
  ],
  low: [
    (o) => `Poxa, ${o}. Vamos devagar hoje? Eu fico pertinho de você.`,
    () => 'Sem pressa. Descansar também é cuidar de si.',
  ],
  bad: [
    (o) => `Sinto muito, ${o}. Estou aqui. Respira fundo, um passo de cada vez.`,
    () => 'Hoje pode ser só ficar quietinho. Eu fico com você.',
  ],
};

/** Expression the character shows while answering, per mood. */
export const moodExpression: Readonly<Record<Mood, string>> = {
  great: 'love',
  good: 'happy',
  okay: 'neutral',
  low: 'sad',
  bad: 'sad',
};

export const cheers: ReadonlyArray<(owner: string) => string> = [
  (o) => `Isso, ${o}! Mais um degrau da montanha!`,
  () => 'Uhul! Sinto a brisa do alto!',
  (o) => `Orgulho de você, ${o}!`,
];

export const greetings = {
  welcomeBack: (owner: string): string => `Que bom te ver de novo, ${owner}!`,
  firstMeeting: (owner: string): string => `Oi, ${owner}! Eu vou subir essa montanha com você.`,
} as const;
