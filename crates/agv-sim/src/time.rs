//! Julian dates and delta-T, ported from `src/sim/time.ts`

const MS_PER_DAY: f64 = 86_400_000.0;
const UNIX_EPOCH_JD: f64 = 2_440_587.5;
const J2000: f64 = 2_451_545.0;

#[derive(Debug, Clone, Copy)]
pub struct JulianTime {
    pub julian_day: f64,
    pub julian_century: f64,
    pub julian_ephemeris_day: f64,
    pub julian_ephemeris_century: f64,
    pub julian_ephemeris_millennium: f64,
}

pub fn julian_time(utc_millis: f64, delta_t: f64) -> JulianTime {
    let julian_day = utc_millis / MS_PER_DAY + UNIX_EPOCH_JD;
    let julian_ephemeris_day = julian_day + delta_t / 86400.0;
    let julian_ephemeris_century = (julian_ephemeris_day - J2000) / 36525.0;
    JulianTime {
        julian_day,
        julian_century: (julian_day - J2000) / 36525.0,
        julian_ephemeris_day,
        julian_ephemeris_century,
        julian_ephemeris_millennium: julian_ephemeris_century / 10.0,
    }
}

/// The civil year and zero-based month for a UTC instant.
///
/// The TypeScript gets this from `new Date(ms).getUTCFullYear()`. Rust's standard library has no
/// calendar, and pulling `chrono` in for two integers would put a dependency into the crate a
/// native binary and the browser both link. Howard Hinnant's `civil_from_days`, which is the
/// algorithm behind most of them anyway, is a dozen lines and exact for every day this application
/// can represent
pub fn utc_year_month(utc_millis: f64) -> (i64, i64) {
    let (year, month, _) = utc_civil(utc_millis);
    (year, month - 1)
}

/// The full civil date: year, month 1 to 12, day of month.
///
/// `utc_year_month` is this with the month zero-based, which is the shape `delta_t_seconds` wants
/// because it's mirroring JavaScript's `getUTCMonth`. Both come from one shared algorithm, which
/// is the whole reason this is factored out
pub fn utc_civil(utc_millis: f64) -> (i64, i64, i64) {
    let days = (utc_millis / MS_PER_DAY).floor() as i64;
    // shift the epoch to 0000-03-01 so leap days land at the end of the cycle
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let day_of_era = z - era * 146_097;
    let year_of_era =
        (day_of_era - day_of_era / 1460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let year = year_of_era + era * 400;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let mp = (5 * day_of_year + 2) / 153;
    // back to a January start
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let day = day_of_year - (153 * mp + 2) / 5 + 1;
    (if month <= 2 { year + 1 } else { year }, month, day)
}

fn is_leap_year(year: i64) -> bool {
    (year % 4 == 0 && year % 100 != 0) || year % 400 == 0
}

/// Day of the year, 1 for January 1.
///
/// The TypeScript computes this as `floor((ms - Date.UTC(year, 0, 1)) / 86400000) + 1`. Same
/// answer, without a second date algorithm beside `utc_civil`
pub fn utc_day_of_year(utc_millis: f64) -> i64 {
    const CUMULATIVE: [i64; 12] = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
    let (year, month, day) = utc_civil(utc_millis);
    let leap = i64::from(month > 2 && is_leap_year(year));
    CUMULATIVE[(month - 1) as usize] + day + leap
}

/// Horner evaluation of one of the Espenak & Meeus pieces
fn poly(base: f64, y: f64, coefficients: &[f64]) -> f64 {
    let t = y - base;
    let mut total = 0.0;
    for coefficient in coefficients.iter().rev() {
        total = total * t + coefficient;
    }
    total
}

/// Espenak & Meeus polynomial expressions, as ported by `pvlib.spa.calculate_deltat`.
///
/// No memo, unlike the TypeScript, which caches per year-month because it's called once per
/// timestep in a hot loop over a whole year. This is a handful of multiplications and Rust isn't
/// paying JavaScript's property-lookup price for them; a cache here would be a `HashMap` on a
/// struct that otherwise has no state
pub fn delta_t_seconds(utc_millis: f64) -> f64 {
    let (year, month) = utc_year_month(utc_millis);
    let y = year as f64 + (month as f64 + 0.5) / 12.0;
    let secular = -20.0 + 32.0 * ((y - 1820.0) / 100.0).powi(2);
    if year < -500 {
        return secular;
    }
    if year < 500 {
        let u = y / 100.0;
        return 10583.6 - 1014.41 * u + 33.78311 * u.powi(2)
            - 5.952053 * u.powi(3)
            - 0.1798452 * u.powi(4)
            + 0.022174192 * u.powi(5)
            + 0.0090316521 * u.powi(6);
    }
    if year < 1600 {
        let u = (y - 1000.0) / 100.0;
        return 1574.2 - 556.01 * u + 71.23472 * u.powi(2) + 0.319781 * u.powi(3)
            - 0.8503463 * u.powi(4)
            - 0.005050998 * u.powi(5)
            + 0.0083572073 * u.powi(6);
    }
    if year < 1700 {
        let u = y - 1600.0;
        return 120.0 - 0.9808 * u - 0.01532 * u.powi(2) + u.powi(3) / 7129.0;
    }
    if year < 1800 {
        let u = y - 1700.0;
        return 8.83 + 0.1603 * u - 0.0059285 * u.powi(2) + 0.00013336 * u.powi(3)
            - u.powi(4) / 1_174_000.0;
    }
    if year < 1860 {
        return poly(
            1800.0,
            y,
            &[
                13.72,
                -0.332447,
                0.0068612,
                0.0041116,
                -0.00037436,
                0.0000121272,
                -0.0000001699,
                0.000000000875,
            ],
        );
    }
    if year < 1900 {
        let u = y - 1860.0;
        return 7.62 + 0.5737 * u - 0.251754 * u.powi(2) + 0.01680668 * u.powi(3)
            - 0.0004473624 * u.powi(4)
            + u.powi(5) / 233_174.0;
    }
    if year < 1920 {
        return poly(
            1900.0,
            y,
            &[-2.79, 1.494119, -0.0598939, 0.0061966, -0.000197],
        );
    }
    if year < 1941 {
        return poly(1920.0, y, &[21.2, 0.84493, -0.0761, 0.0020936]);
    }
    if year < 1961 {
        let u = y - 1950.0;
        return 29.07 + 0.407 * u - u.powi(2) / 233.0 + u.powi(3) / 2547.0;
    }
    if year < 1986 {
        let u = y - 1975.0;
        return 45.45 + 1.067 * u - u.powi(2) / 260.0 - u.powi(3) / 718.0;
    }
    if year < 2005 {
        return poly(
            2000.0,
            y,
            &[
                63.86,
                0.3345,
                -0.060374,
                0.0017275,
                0.000651814,
                0.00002373599,
            ],
        );
    }
    if year < 2050 {
        return poly(2000.0, y, &[62.92, 0.32217, 0.005589]);
    }
    if year < 2150 {
        return secular - 0.5628 * (2150.0 - y);
    }
    secular
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_calendar_back_off_the_epoch() {
        assert_eq!(utc_year_month(0.0), (1970, 0));
        // 2003-10-17, the NREL worked example's date
        assert_eq!(utc_year_month(1_066_349_100_000.0), (2003, 9));
        // and before the epoch, where a truncating division would go wrong
        assert_eq!(utc_year_month(-1.0), (1969, 11));
    }

    #[test]
    fn julian_day_of_the_unix_epoch_is_the_documented_one() {
        let jt = julian_time(0.0, 0.0);
        assert!((jt.julian_day - 2_440_587.5).abs() < 1e-9);
    }
}
