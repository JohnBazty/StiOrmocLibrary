import { configure } from '@testing-library/react'

// The default 1 s findBy* wait times out when the full suite runs files in parallel.
configure({ asyncUtilTimeout: 5000 })
