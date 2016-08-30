
window.initializeReveal = ({ multiplex }) => {
  const secret = ((window.location.search || '').match(/secret=([^&]+)/) || [])[1]
  const CDN = 'https://cdn.rawgit.com/hakimel/reveal.js/master'
  Reveal.initialize({
    history: true,
    controls: false,
    center: false,
    ...(multiplex && !secret && {
      keyboard: false,
      touch: false,
      overview: false,
      progress: false,
    }),

    multiplex: multiplex && {
      secret: secret || null,
      id: '0d7b5d31ddea3237',
      url: 'https://reveal-js-multiplex-fnhnqdtuhq.now.sh',
    },
    dependencies: [
      { src: '//cdn.socket.io/socket.io-1.3.5.js', async: true },
      { src: `${CDN}/plugin/multiplex/${secret ? 'master' : 'client'}.js`, async: true },

      { src: `${CDN}/lib/js/classList.js`, condition: () => !document.body.classList },
      { src: `${CDN}/plugin/markdown/marked.js`, condition: () => !!document.querySelector('[data-markdown]') },
      { src: `${CDN}/plugin/markdown/markdown.js`, condition: () => !!document.querySelector('[data-markdown]') },
      { src: `${CDN}/plugin/highlight/highlight.js`, async: true, callback: () => { hljs.initHighlightingOnLoad() } },
    ],
  })
}


const randomX = d3.randomUniform(0, 10)
const randomY = d3.randomNormal(5, 1.5)
window.state = {
  options: {
    multiplex: false,
  },
  charts: [],
  folks: [],
  folks: d3.range(0, 150).map(i => ({
    id: i,
    hungry: randomX(),
    feeling: randomY()
  }))
}

// initializeReveal(state.options)


let timeout
const connect = () => {
  const horizon = Horizon({ authType: 'anonymous', keepalive: 25, host: window.location.host + window.location.pathname.slice(0,-1) })
  window.horizon = horizon
  horizon.onReady(() => {
    console.log('Connected')
    window.clearInterval(timeout)

    horizon('options').watch().subscribe(([options]) => {
      state = { ...state, options }
      updateView()
    })

    horizon('charts').watch().subscribe(charts => {
      state = { ...state, charts: charts.sort((a, b) => d3.ascending(a.index, b.index)) }
      updateView()
    })

    horizon.currentUser().fetch().subscribe(user => {
      const usersCollection = horizon('users')
      state = { ...state, id: user.id, me: user, usersCollection }
      usersCollection.watch().subscribe(folks => {
        const [me] = folks.filter(d => d.id === state.id)
        state = { ...state, folks, me }
        updateView()
      })
    })
  })
  horizon.onDisconnected(() => {
    console.log('Disconnected. Reconnecting...')
    window.clearInterval(timeout)
    timeout = window.setInterval(() => {
      connect()
    }, 3000)
  })
  horizon.connect()
}
connect()



const renderQuestion = sel => {
  let form = sel.select('form')
  if (form.empty()) {
    form = sel.append('form')
      .on('submit', d => {
        state.usersCollection.update({
          id: state.id,
          [d.id]: +d3.select(d3.event.target).select('input').property('value')
        })
        d3.event.preventDefault()
      })
      .call(sel => sel
        .append('label')
        .call(sel => sel.append('h3'))
        .call(sel => sel
          .append('input')
            .style('width', '300px')
            .style('height', '30px')
            .attr('type', 'range')
            .attr('min', 0).attr('max', 10)
            .attr('step', 0.01)
            .attr('value', d => state.me[d.id])
        )
        .call(sel => sel
          .append('input').attr('type', 'submit')
        )
      )
  }
  sel.select('label > h3').html(d => d.question)

}


const renderChart = svg => {
  const d = svg.datum()
  
  const [width, height] = !d.chart.tsne ? [600, d.chart.y ? 400 : 100] : [600, 600]

  const x = d3.scaleLinear().domain([0, 10]).range([0, width]),
        y = d3.scaleLinear().domain([0, 10]).range([height, 0])

  let data, xQuestion, yQuestion, showXAxis = true, showYAxis = true
  if (d.chart.tsne) {
    showXAxis = false
    showYAxis = false
    data = []
    if (state.folks.length) {
      const tabular = state.folks.map(person =>
        state.charts.filter(d => d.question).map(question => person[d.id] || 5)
      )
      const tsne = new tsnejs.tSNE({
        epsilon: 10, // epsilon is learning rate (10 = default)
        perplexity: 30, // roughly how many neighbors each point influences (30 = default)
        dim: 2, // dimensionality of the embedding (2 = default)
      })
      tsne.initDataRaw(tabular)
      for(var k = 0; k < 500; k++) tsne.step()

      ;[xQuestion, yQuestion] = [0, 1]
      data = tsne.getSolution().map((d, i) => ({ ...d, id: state.folks[i].id }))
      x.domain(d3.extent(data, d => d[0]))
      y.domain(d3.extent(data, d => d[1]))
    }
  }
  else {
    ({ x: xQuestion, y: yQuestion } = d.chart)
    data = state.folks.filter(d => d[xQuestion] != null && (!yQuestion || d[yQuestion] != null))
    showYAxis = yQuestion
  }


  svg.attr('width', width).attr('height', height)

  const people = svg.selectAll('.person').data(data, d => d.id)
  people.exit().remove()
  people
    .order()
    .enter().append('circle').attr('class', 'person')
      .attr('cx', d => x(d[xQuestion]))
      .attr('cy', d => yQuestion ? y(d[yQuestion]) : 75)
    .merge(people)
      .call(sel => sel.filter(d => d.id === state.id).raise().style('fill', 'red'))
      .transition()
      .attr('r', d => 4)
      .attr('cx', d => x(d[xQuestion]))
      .attr('cy', d => yQuestion ? y(d[yQuestion]) : 75)
  
  
  let axisBottom = svg.select('.axisBottom')
  if (showXAxis) {
    if (axisBottom.empty()) {
      axisBottom = svg.append('g').attr('class', 'axisBottom')
        .call(sel => sel.append('g').attr('class', 'axis'))
        .call(sel => sel.append('text').attr('class', 'axisLabel'))
    }
    axisBottom.attr('transform', `translate(0, ${height})`)
    axisBottom.select('.axis').call(d3.axisBottom(x))
    axisBottom.select('.axisLabel')
      .attr('x', width / 2).attr('y', 40).attr('dy', '1em')
      .attr('text-anchor', 'middle').html(xQuestion)
  }
  else axisBottom.remove()

  let axisLeft = svg.select('.axisLeft')
  if (showYAxis) {
    if (axisLeft.empty()) {
      axisLeft = svg.append('g').attr('class', 'axisLeft')
        .call(sel => sel.append('g').attr('class', 'axis'))
        .call(sel => sel.append('text').attr('class', 'axisLabel'))
      }
    axisLeft.select('.axis').call(d3.axisLeft(y))
    axisLeft.select('.axisLabel')
      .attr('x', -40).attr('y', height / 2)
      .attr('text-anchor', 'end').html(yQuestion)
  }
  else axisLeft.remove()
  

  if (d.chart.fit && data.length && yQuestion) {
    // Non-parametric best-fit curve
    const bandwidth = d.chart.fit === true ? 0.2 : +d.chart.fit,
          sortedData = data.sort((a, b) => d3.ascending(a[xQuestion], b[xQuestion])),
          loess = science.stats.loess().bandwidth(Math.max(bandwidth, 2 / data.length)),
          line = d3.line().x(d => x(d[0])).y(d => y(d[1])),
          xValues = sortedData.map(d => d[xQuestion]),
          yValues = sortedData.map(d => d[yQuestion]),
          loessData = d3.zip(xValues, loess(xValues, yValues)),
          loessSelection = svg.selectAll('.loess').data([loessData])

    loessSelection.exit().remove()
    loessSelection
      .enter().append('path').attr('class', 'loess')
      .merge(loessSelection).attr('d', line)
  }
  else {
    svg.selectAll('.loess').remove()
  }

}


const renderSection = sel => {
  const d = sel.datum()

  const showQuestion = d.question
  let questionSel = sel.select('.question')
  if (showQuestion) {
    if (questionSel.empty()) questionSel = sel.append('div').attr('class', 'question')
    questionSel.call(renderQuestion)
  }
  else {
    questionSel.remove()
  }

  const showChart = !d.question || state.me[d.id] != null
  let chartSel = sel.select('svg')
  if (showChart) {
    if (chartSel.empty()) chartSel = sel.append('svg')
    chartSel.call(renderChart)
  }
  else {
    chartSel.remove()
  }

}


const updateView = () => {
  const sections = d3.select('.charts').selectAll('section').data(state.charts)
  sections.exit().remove()
  sections
    .enter().append('section')
    .merge(sections)
    .each(function() { d3.select(this).call(renderSection) })
  
  initializeReveal(state.options)

}

