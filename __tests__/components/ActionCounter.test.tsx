/**
 * @vitest-environment jsdom
 */
import '@testing-library/jest-dom'
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ActionCounter } from '@/app/w/[slug]/components/ActionCounter'

describe('ActionCounter', () => {
  it('displays used / cap label', () => {
    render(<ActionCounter used={10} cap={50} />)
    expect(screen.getByTestId('action-counter-label')).toHaveTextContent('10 / 50')
  })

  it('renders progress bar at correct percentage width', () => {
    render(<ActionCounter used={25} cap={50} />)
    const bar = screen.getByTestId('action-counter-bar')
    expect(bar).toHaveStyle({ width: '50%' })
  })

  it('uses normal colour when under 80% usage', () => {
    render(<ActionCounter used={39} cap={50} />)
    const bar = screen.getByTestId('action-counter-bar')
    expect(bar).toHaveStyle({ backgroundColor: '#1164a3' })
    expect(screen.getByTestId('action-counter-label')).toHaveStyle({ color: '#868686' })
  })

  it('switches to warning colour at exactly 80% usage', () => {
    render(<ActionCounter used={40} cap={50} />)
    const bar = screen.getByTestId('action-counter-bar')
    expect(bar).toHaveStyle({ backgroundColor: '#e8a838' })
    expect(screen.getByTestId('action-counter-label')).toHaveStyle({ color: '#e8a838' })
  })

  it('uses warning colour above 80%', () => {
    render(<ActionCounter used={49} cap={50} />)
    expect(screen.getByTestId('action-counter-bar')).toHaveStyle({ backgroundColor: '#e8a838' })
  })

  it('renders 100% width when cap is fully used', () => {
    render(<ActionCounter used={50} cap={50} />)
    expect(screen.getByTestId('action-counter-bar')).toHaveStyle({ width: '100%' })
  })
})
