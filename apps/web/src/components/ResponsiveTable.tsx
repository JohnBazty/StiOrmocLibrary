import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react'

type Element = ReactElement<{ children?: ReactNode; colSpan?: number; 'aria-hidden'?: boolean | 'true' | 'false' }>

function headerText(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (!isValidElement(node)) return Children.toArray(node).map(headerText).join(' ')
  if ((node as Element).props['aria-hidden'] === true || (node as Element).props['aria-hidden'] === 'true') return ''
  return headerText((node as Element).props.children)
}

function headings(node: ReactNode): string[] {
  return Children.toArray(node).flatMap(child => {
    if (!isValidElement(child)) return []
    const element = child as Element
    return element.type === 'th' ? [headerText(element.props.children).replace(/\s+/g, ' ').trim()] : headings(element.props.children)
  })
}

function annotateRows(node: ReactNode, labels: string[]): ReactNode {
  return Children.map(node, child => {
    if (!isValidElement(child)) return child
    const element = child as Element
    if (element.type === 'tr') {
      let column = 0
      return cloneElement(element, {}, Children.map(element.props.children, cell => {
        if (!isValidElement(cell)) return cell
        const entry = cell as Element
        const span = entry.props.colSpan ?? 1
        const label = span === 1 ? labels[column] : undefined
        column += span
        if (entry.type !== 'td' || !label) return entry
        return cloneElement(entry, { 'data-label': label } as object,
          <div className="responsive-cell-value">{entry.props.children}</div>)
      }))
    }
    return cloneElement(element, {}, annotateRows(element.props.children, labels))
  })
}

/** A single semantic table; phone layouts retain all values and interactive cells. */
export function ResponsiveTable({ children, label = 'Records', className = '' }: {
  children: ReactElement<{ children?: ReactNode }>
  label?: string
  className?: string
}) {
  const sections = Children.toArray(children.props.children)
  const head = sections.find(section => isValidElement(section) && section.type === 'thead') as Element | undefined
  const labels = headings(head?.props.children)
  const table = cloneElement(children, {}, sections.map(section => {
    if (!isValidElement(section) || section.type !== 'tbody') return section
    return cloneElement(section as Element, {}, annotateRows((section as Element).props.children, labels))
  }))
  return <div className={`responsive-table ${className}`} role="region" aria-label={label} tabIndex={0}>{table}</div>
}
