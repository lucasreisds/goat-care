/** Names of characters, stages and items shown to the player (keys come from pack and item manifests). */
export const characters: Readonly<Record<string, string>> = {
  'character.mountainGoat': 'Cabra das Montanhas',
};

/** Evolution stage names, by stage id from the pack manifest. */
export const stageNames: Readonly<Record<string, string>> = {
  kid: 'filhote',
  young: 'jovem',
  adult: 'adulto',
  legendary: 'lendário',
};

export const itemNames: Readonly<Record<string, string>> = {
  'item.beanieBlue': 'Gorro azul',
  'item.scarfRed': 'Cachecol vermelho',
  'item.sweaterGreen': 'Suéter verde',
  'item.pantsBrown': 'Calça marrom',
  'item.bootsBrown': 'Botas marrons',
  'item.flowerPink': 'Flor rosa',
  'item.bellCollar': 'Coleira com sino',
};
