import * as React from 'react'
import { Box, Text } from '../../ink.js'
import { env } from '../../utils/env.js'

export type ClawdPose = 'default' | 'arms-up' | 'look-left' | 'look-right'

type Props = {
  pose?: ClawdPose
}

type SpriteSegment = {
  text: string
  color?: string
  backgroundColor?: string
}

type SpriteRow = SpriteSegment[]

type MascotSprite = {
  rows: SpriteRow[]
}

const FACE_BG = 'clawd_fill'
const OUTLINE = 'clawd_background'
const BODY = 'clawd_body'
const WHISKER = 'subtle'

function earRow(): SpriteRow {
  return [{ text: ' ╭◜     ◝╮ ', color: BODY }]
}

function faceRow(row: string): SpriteRow {
  return [{ text: row, color: OUTLINE, backgroundColor: FACE_BG }]
}

function mouthRow(): SpriteRow {
  return [
    { text: '  ' },
    { text: '╲', color: OUTLINE, backgroundColor: FACE_BG },
    { text: '  ', backgroundColor: FACE_BG },
    { text: '◡', color: WHISKER, backgroundColor: FACE_BG },
    { text: '  ', backgroundColor: FACE_BG },
    { text: '╱', color: OUTLINE, backgroundColor: FACE_BG },
    { text: '  ' },
  ]
}

const POSES: Record<ClawdPose, MascotSprite> = {
  default: {
    rows: [earRow(), faceRow('◟  ◕   ◕  ◞'), mouthRow()],
  },
  'look-left': {
    rows: [earRow(), faceRow('◟ ◕   ◕   ◞'), mouthRow()],
  },
  'look-right': {
    rows: [earRow(), faceRow('◟   ◕   ◕ ◞'), mouthRow()],
  },
  'arms-up': {
    rows: [
      [{ text: '╭  ◜   ◝  ╮', color: BODY }],
      [{ text: '╰  ×   ×  ╯', color: OUTLINE, backgroundColor: FACE_BG }],
      [
        { text: '  ' },
        { text: '│', color: OUTLINE, backgroundColor: FACE_BG },
        { text: '  ', backgroundColor: FACE_BG },
        { text: '◡', color: WHISKER, backgroundColor: FACE_BG },
        { text: '  ', backgroundColor: FACE_BG },
        { text: '│', color: OUTLINE, backgroundColor: FACE_BG },
        { text: '  ' },
      ],
    ],
  },
}

const APPLE_TERMINAL_ROWS: Record<ClawdPose, readonly [string, string, string]> = {
  default: [' ╭◜     ◝╮ ', '◟  ◕   ◕  ◞', '  ╲  ◡  ╱  '],
  'look-left': [' ╭◜     ◝╮ ', '◟ ◕   ◕   ◞', '  ╲  ◡  ╱  '],
  'look-right': [' ╭◜     ◝╮ ', '◟   ◕   ◕ ◞', '  ╲  ◡  ╱  '],
  'arms-up': ['╭  ◜   ◝  ╮', '╰  ×   ×  ╯', '  │  ◡  │  '],
}

function renderRow(row: SpriteRow, rowIndex: number): React.ReactNode {
  return (
    <Text key={rowIndex}>
      {row.map((segment, segmentIndex) => (
        <Text
          key={segmentIndex}
          color={segment.color}
          backgroundColor={segment.backgroundColor}
        >
          {segment.text}
        </Text>
      ))}
    </Text>
  )
}

function AppleTerminalClawd({ pose }: { pose: ClawdPose }): React.ReactNode {
  const [ears, eyes, mouth] = APPLE_TERMINAL_ROWS[pose]

  return (
    <Box flexDirection="column" alignItems="center">
      <Text color={BODY}>{ears}</Text>
      <Text color={OUTLINE} backgroundColor={FACE_BG}>
        {eyes}
      </Text>
      <Text color={OUTLINE} backgroundColor={FACE_BG}>
        {mouth}
      </Text>
    </Box>
  )
}

export function Clawd({ pose = 'default' }: Props = {}): React.ReactNode {
  if (env.terminal === 'Apple_Terminal') {
    return <AppleTerminalClawd pose={pose} />
  }

  return (
    <Box flexDirection="column" alignItems="center">
      {POSES[pose].rows.map(renderRow)}
    </Box>
  )
}
