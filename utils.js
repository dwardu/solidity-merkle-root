const { promisify } = require('util')

const numberSum = values => values.reduce((a, b) => a + b)

const bnSum = values => values.reduce((a, b) => a.add(b))

const count = (from, to, step = 1) => {
  const n = Math.floor((to - from) / step)
  const ans = new Array(n)
  for (let i = 0; i < n; i++) {
    ans[i] = from + step * i
  }
  return ans
}

const toHex = numBytes => value => `0x${value.toString(16).padStart(numBytes * '00'.length, '0')}`

const snakifyCamel = camel => camel.replace(/[A-Z]/g, hump => `_${hump.toLowerCase()}`)

const wrapJsonRpcProvider = provider => {
  const send = promisify(provider.send)
  return new Proxy(
    {
      nextId: Number.MAX_SAFE_INTEGER
    },
    {
      get: (obj, camelMethod) => {
        const method = snakifyCamel(camelMethod)
        return params =>
          send({
            jsonrpc: '2.0',
            method,
            params,
            id: obj.nextId--
          })
      }
    }
  )
}

module.exports = {
  numberSum,
  bnSum,
  count,
  toHex,
  wrapJsonRpcProvider
}
