import { dbConnect, Project, ManuscriptVersion, newObjectId } from '@publication-prepare/db'
import { createProjectService } from '@publication-prepare/manuscript'

const service = createProjectService({ Project, ManuscriptVersion, newObjectId })

// Memastikan koneksi DB sebelum setiap operasi service.
export async function projects() {
  await dbConnect()
  return service
}
