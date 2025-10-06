export const SECTION_COLORS = {
  retirement: '#673ab7',
  accounts: '#1565c0',
  realEstate: '#2e7d32',
  contributions: '#ef6c00',
  expenses: '#c62828',
  social: '#6d4c41'
} as const

export type SectionColorKey = keyof typeof SECTION_COLORS

export const headingStyle = (key: SectionColorKey) => ({
  color: SECTION_COLORS[key],
  fontWeight: 600,
  borderBottom: `2px solid ${SECTION_COLORS[key]}`,
  display: 'inline-block',
  paddingBottom: '2px',
  marginBottom: '12px'
})

export const accentBorder = (key: SectionColorKey) => ({
  borderTop: `4px solid ${SECTION_COLORS[key]}`,
  borderRadius: 2
})

export const mutedChip = (key: SectionColorKey) => ({
  backgroundColor: `${SECTION_COLORS[key]}10`,
  color: SECTION_COLORS[key],
  fontWeight: 500
})
