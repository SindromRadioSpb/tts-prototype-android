'use strict';

function buildGeminiTableResponseSchema(SchemaType) {
  if (!SchemaType) throw new Error('SchemaType required');
  return {
    type: SchemaType.OBJECT,
    properties: {
      rows: {
        type: SchemaType.ARRAY,
        items: {
          type: SchemaType.OBJECT,
          properties: {
            segment_index: { type: SchemaType.INTEGER },
            he: { type: SchemaType.STRING },
            he_niqqud: { type: SchemaType.STRING },
            ru: { type: SchemaType.STRING },
          },
          // Без translit (O-006): сервер считает его из he_niqqud выбранным профилем.
          required: ['segment_index', 'he', 'he_niqqud', 'ru'],
        },
      },
    },
    required: ['rows'],
  };
}

module.exports = { buildGeminiTableResponseSchema };
