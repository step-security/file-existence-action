import * as core from '@actions/core'
import glob from 'glob'
import * as fs from 'fs'
import axios, {isAxiosError} from 'axios'

export async function checkExistence(pattern: string): Promise<boolean> {
  const globOptions = {
    follow: !(
      (core.getInput('follow_symlinks') || 'true').toUpperCase() === 'FALSE'
    ),
    nocase: (core.getInput('ignore_case') || 'false').toUpperCase() === 'TRUE'
  }
  return new Promise((resolve, reject) => {
    glob(pattern, globOptions, (err: unknown, files: string[]) => {
      if (err) {
        reject(err)
      } else {
        resolve(files.length > 0)
      }
    })
  })
}

async function validateSubscription(): Promise<void> {
  const eventPath = process.env.GITHUB_EVENT_PATH
  let repoPrivate: boolean | undefined

  if (eventPath && fs.existsSync(eventPath)) {
    const eventData = JSON.parse(fs.readFileSync(eventPath, 'utf8'))
    repoPrivate = eventData?.repository?.private
  }

  const upstream = 'andstor/file-existence-action'
  const action = process.env.GITHUB_ACTION_REPOSITORY
  const docsUrl =
    'https://docs.stepsecurity.io/actions/stepsecurity-maintained-actions'

  core.info('')
  core.info('\u001b[1;36mStepSecurity Maintained Action\u001b[0m')
  core.info(`Secure drop-in replacement for ${upstream}`)
  if (repoPrivate === false)
    core.info('\u001b[32m\u2713 Free for public repositories\u001b[0m')
  core.info(`\u001b[36mLearn more:\u001b[0m ${docsUrl}`)
  core.info('')

  if (repoPrivate === false) return

  const serverUrl = process.env.GITHUB_SERVER_URL || 'https://github.com'
  const body: Record<string, string> = {action: action || ''}
  if (serverUrl !== 'https://github.com') body.ghes_server = serverUrl
  try {
    await axios.post(
      `https://agent.api.stepsecurity.io/v1/github/${process.env.GITHUB_REPOSITORY}/actions/maintained-actions-subscription`,
      body,
      {timeout: 3000}
    )
  } catch (error) {
    if (isAxiosError(error) && error.response?.status === 403) {
      core.error(
        `\u001b[1;31mThis action requires a StepSecurity subscription for private repositories.\u001b[0m`
      )
      core.error(
        `\u001b[31mLearn how to enable a subscription: ${docsUrl}\u001b[0m`
      )
      process.exit(1)
    }
    core.info('Timeout or API not reachable. Continuing to next step.')
  }
}

async function run(): Promise<void> {
  try {
    await validateSubscription()
    const files: string = core.getInput('files', {required: true})
    const allow_failure: boolean =
      (core.getInput('allow_failure') || 'false').toUpperCase() === 'TRUE'
    if (core.getInput('allow_failure')) {
      core.warning(
        `❗The "allow_failure" variable is deprecated in favor of "fail"`
      )
    }
    const failure: boolean =
      (core.getInput('fail') || 'false').toUpperCase() === 'TRUE' ||
      allow_failure
    const fileList: string[] = files
      .split(',')
      .map((item: string) => item.trim())
    const missingFiles: string[] = []

    // Check in parallel
    await Promise.all(
      fileList.map(async (file: string) => {
        const isPresent = await checkExistence(file)
        if (!isPresent) {
          missingFiles.push(file)
        }
      })
    )

    if (missingFiles.length > 0) {
      if (failure) {
        core.setFailed(`These files don't exist: ${missingFiles.join(', ')}`)
      } else {
        core.info(`These files don't exist: ${missingFiles.join(', ')}`)
      }
      core.setOutput('files_exists', 'false')
    } else {
      core.info('🎉 All files exist')
      core.setOutput('files_exists', 'true')
    }
  } catch (error) {
    if (!(error instanceof Error)) {
      throw error
    }
    core.setFailed(error.message)
  }
}

run()
