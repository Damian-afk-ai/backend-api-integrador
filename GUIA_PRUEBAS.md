# Pruebas de los seis endpoints

Ejecutar npm test -- --verbose --json --outputFile=report/test-results.json y node scripts/coverage-summary.js. El umbral global es 70% para líneas, sentencias, funciones y ramas. index.test.js comprueba las seis rutas, persistencia, validación, errores y ausencia de rutas adicionales. coverage/lcov-report/index.html contiene el detalle. Las pruebas usan una base en memoria y no cambian datos locales.
