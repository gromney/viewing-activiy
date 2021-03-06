import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';

import { Papa } from 'ngx-papaparse';
import { from, partition, BehaviorSubject } from 'rxjs';
import { map, concatMap, groupBy, mergeMap, reduce, } from 'rxjs/operators';
import { NetflixData } from '../models/NetflixData';
import { environment } from 'src/environments/environment';
import { TmdbMovieResponse } from '../models/tmdbMovieResponse';
import { TmdbTvshowResponse } from '../models/tmdbTvshowResponse';
import { MovieDetail } from '../models/movie-detail.model';
import { TvShowDetail } from '../models/tvshow-detail.model';
import { TimeSpent } from '../models/time-spent.model';
import { LoadedNetflixData } from '../models/loaded-netflix-data.model';


const apiKey = environment.tmdb.apiKey;
const apiBaseUrl = environment.tmdb.apiBaseUrl;

@Injectable({ providedIn: 'root' })
export class TmdbService {
    private defautParams = new HttpParams().set('api_key', apiKey).set('page', '1').set('include_adul', 'false');

    loadedNetflixData = new BehaviorSubject<LoadedNetflixData>(new LoadedNetflixData());
    result = new BehaviorSubject<TimeSpent>(new TimeSpent());

    netflixData: NetflixData[] = [];

    constructor(private http: HttpClient, private papa: Papa) { }

    updateNetflixData() {
        this.loadedNetflixData.next(new LoadedNetflixData());
        const csv = JSON.parse(localStorage.getItem('netflix_data') || '[]');

        this.papa.parse(csv, {
            header: true,
            skipEmptyLines: true,
            complete: (result) => {
                this.jsonToNetflixData(result.data);
            }
        })

        this.getTmdbData();
    }

    private jsonToNetflixData(data: { Title: string, Date: string }[]) {
        var date = new Date();
        date.setFullYear(date.getFullYear() - 1);

        let last_year_data = data.filter(x => new Date(x.Date) >= date)

        let netflix_data = from(last_year_data);
        this.netflixData = [];
        netflix_data.pipe(
            map(x => {
                return new NetflixData(x.Title, x.Date);
            })
        ).subscribe(x => this.netflixData.push(x))
    }

    private getTmdbData() {
        let [tvshow, movies] = partition(this.netflixData, (val) => val.Type == 'TvShow');

        //Search movies and get movie details
        movies.pipe(
            concatMap(data => {
                return this.searchMovie(data.Title).pipe(
                    concatMap(movies => {
                        return this.getMovieDetails(movies[0].id).pipe(
                            map(x => {
                                x.viewed_date = data.Date;
                                return x;
                            })
                        )
                    })
                )
            })
        ).subscribe(next => {
            let curr = this.loadedNetflixData.getValue();
            curr.movies.push(next)
            this.loadedNetflixData.next(curr);
        });

        //Search tvshow and get tvshow details
        tvshow.pipe(
            groupBy(x => x.Title),
            mergeMap(g => g.pipe(
                reduce((acc, cur) => [...acc, cur], [`${g.key}`]))),
            map(arr => ({ Title: arr[0], watched_episodes: arr.slice(1).length }))
        ).pipe(
            concatMap(tvshow => {
                return this.searchTvshow(tvshow.Title).pipe(
                    concatMap(tvresp => {
                        return this.getTvshowDetails(tvresp[0].id).pipe(
                            map(x => {
                                x.watched_episodes = tvshow.watched_episodes;
                                return x;
                            })
                        )
                    })
                )
            })
        ).subscribe(next => {
            let curr = this.loadedNetflixData.getValue();
            curr.tvshows.push(next)
            this.loadedNetflixData.next(curr);
        })

    }

    private searchMovie(title: string) {
        ///TODO: get all results when multiple pages returned

        return this.http.get<TmdbMovieResponse>(`${apiBaseUrl}/search/movie`, {
            params: this.defautParams.append('query', title)
        }).pipe(
            map(resp => {
                return resp.results.filter(x => x.title == title);
            })
        )
    }

    private getMovieDetails(id: number) {
        return this.http.get<MovieDetail>(`${apiBaseUrl}/movie/${id}`, {
            params: new HttpParams().set('api_key', apiKey)
        });
    }

    private searchTvshow(title) {
        return this.http.get<TmdbTvshowResponse>(`${apiBaseUrl}/search/tv`, {
            params: this.defautParams.append('query', title)
        }).pipe(
            map(resp => {
                return resp.results;
            })
        )
    }

    private getTvshowDetails(id: number) {
        return this.http.get<TvShowDetail>(`${apiBaseUrl}/tv/${id}`, {
            params: new HttpParams().set('api_key', apiKey)
        });
    }
}