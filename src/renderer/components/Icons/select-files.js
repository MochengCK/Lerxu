import Icon from '@/components/Icons/Icon'

Icon.register({
  'select-files': {
    'width': 24,
    'height': 24,
    'raw': `<rect x="3" y="4.5" width="5" height="5" rx="1" fill="none" stroke-miterlimit="10"/>
      <polyline points="4.3,7 6,8.8 9,5.2" fill="none" stroke-miterlimit="10"/>
      <line x1="11.5" y1="7" x2="21" y2="7" stroke-miterlimit="10"/>
      <rect x="3" y="14.5" width="5" height="5" rx="1" fill="none" stroke-miterlimit="10"/>
      <line x1="11.5" y1="17" x2="21" y2="17" stroke-miterlimit="10"/>`,
    'g': {
      'stroke': 'currentColor',
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'stroke-width': '2',
      'fill': 'none'
    }
  }
})
