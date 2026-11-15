import Workspace from '../../../../components/projects/Workspace'

export const metadata = { title: 'Proyek' }

export default function ProjectPage({ params }) {
  return <Workspace projectId={params.id} />
}
