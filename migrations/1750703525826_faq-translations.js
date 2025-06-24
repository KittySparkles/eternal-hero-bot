/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const up = pgm => {
  pgm.createTable('faq_translations', {
    thread_id: { type: 'text', notNull: true },
    language: { type: 'text', notNull: true },
    translated_title: { type: 'text', notNull: true },
    translated_content: { type: 'text', notNull: true },
    translated_at: {
      type: 'timestamp with time zone',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  })

  pgm.addConstraint('faq_translations', 'faq_translations_pkey', {
    primaryKey: ['thread_id', 'language'],
  })

  pgm.createIndex('faq_translations', 'language')
  pgm.createIndex('faq_translations', 'thread_id')
}

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const down = pgm => {
  pgm.dropTable('faq_translations')
}
