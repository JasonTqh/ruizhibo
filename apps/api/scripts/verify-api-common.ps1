function Write-Step {
  param([string]$Message)
  Write-Host "[verify] $Message"
}

function Read-ErrorContent {
  param($ErrorRecord)

  if ($ErrorRecord.ErrorDetails -and $ErrorRecord.ErrorDetails.Message) {
    return $ErrorRecord.ErrorDetails.Message
  }

  $response = $ErrorRecord.Exception.Response
  if ($response -and $response.GetResponseStream) {
    $stream = $response.GetResponseStream()
    if ($stream) {
      $reader = New-Object System.IO.StreamReader($stream)
      return $reader.ReadToEnd()
    }
  }

  return ""
}

function Invoke-Api {
  param(
    [string]$Method,
    [string]$Path,
    [object]$Body = $null,
    [string]$Token = "",
    [int]$ExpectedStatus = 200
  )

  $headers = @{}
  if ($Token) {
    $headers["Authorization"] = "Bearer $Token"
  }

  $request = @{
    Uri = "$script:BaseUrl$Path"
    Method = $Method
    Headers = $headers
    UseBasicParsing = $true
    TimeoutSec = 15
  }

  if ($null -ne $Body) {
    $request["ContentType"] = "application/json"
    $request["Body"] = ($Body | ConvertTo-Json -Depth 10 -Compress)
  }

  try {
    $response = Invoke-WebRequest @request
    $status = [int]$response.StatusCode
    $content = $response.Content
  } catch {
    if (-not $_.Exception.Response) {
      throw "Cannot reach $($request.Uri): $($_.Exception.Message)"
    }
    $status = [int]$_.Exception.Response.StatusCode
    $content = Read-ErrorContent $_
  }

  if ($status -ne $ExpectedStatus) {
    throw "Expected $Method $Path to return $ExpectedStatus, got $status. Body: $content"
  }

  $parsed = $null
  if ($content) {
    $parsed = $content | ConvertFrom-Json
  }

  return @{
    Status = $status
    Body = $parsed
    Raw = $content
  }
}

function Assert-True {
  param(
    [bool]$Condition,
    [string]$Message
  )

  if (-not $Condition) {
    throw $Message
  }
}

function Assert-DataArray {
  param(
    $Response,
    [string]$Message
  )

  Assert-True ($null -ne $Response.Body.data) $Message
}
