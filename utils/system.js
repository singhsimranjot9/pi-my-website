// Import core Node modules
const os = require('os');
const { exec } = require('child_process');
const { promisify } = require('util');

// Convert exec to a Promise-based function
const execAsync = promisify(exec);

// Get CPU usage per core as percentage
function getCpuUsage() {
  const cpus = os.cpus();
  return cpus.map(cpu => {
    const total = Object.values(cpu.times).reduce((acc, val) => acc + val, 0); // Total time
    const usage = 100 - (100 * cpu.times.idle) / total; // Used = Total - Idle
    return usage.toFixed(1); // Rounded to 1 decimal
  });
}

// Get CPU temperature from vcgencmd (specific to Raspberry Pi)
async function getCpuTemp() {
  try {
    const { stdout } = await execAsync('vcgencmd measure_temp');
    return parseFloat(stdout.replace('temp=', '').replace("'C", '')); // Extract number
  } catch {
    return null; // Return null if command fails
  }
}

// Convert bytes to gigabytes with 2 decimal precision
function bytesToGB(bytes) {
  return (bytes / (1024 ** 3)).toFixed(2);
}

// Get disk usage using 'df -k /'
async function getDiskUsage() {
  try {
    const { stdout } = await execAsync('df -k /'); // Check root disk space
    const lines = stdout.trim().split('\n');       // Split output lines
    const parts = lines[1].split(/\s+/);           // Parse second line

    const used = parseInt(parts[2]) * 1024;        // Used in bytes
    const total = parseInt(parts[1]) * 1024;       // Total in bytes

    return {
      used: bytesToGB(used),
      total: bytesToGB(total)
    };
  } catch (err) {
    console.error('Disk error:', err);
    return { used: '0', total: '0' }; // Fallback values
  }
}

// Combine all system info into a single object
async function getSystemDetails() {
  const cpuUsage = getCpuUsage();                  // % CPU usage per core
  const cpuTemp = await getCpuTemp();              // Current CPU temperature
  const totalMem = os.totalmem();                  // Total system memory
  const freeMem = os.freemem();                    // Free memory
  const usedMem = totalMem - freeMem;              // Used memory
  const disk = await getDiskUsage();               // Disk usage

  return {
    cpuTemp,
    cpuUsage,
    memory: {
      used: bytesToGB(usedMem),
      total: bytesToGB(totalMem)
    },
    disk,
    platform: os.platform(),                       // e.g., 'linux'
    arch: os.arch(),                               // e.g., 'arm64'
    hostname: os.hostname()                        // e.g., 'raspberrypi'
  };
}

// Export function for use in routes
module.exports = { getSystemDetails };
