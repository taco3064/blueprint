import { Card } from '@/components/card'
import { load } from '@/lib/data'
export default function Home() { return <Card>{load()}</Card> }
